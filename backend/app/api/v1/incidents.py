from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user, role_check

# Import blockchain and notifications with error handling
try:
    from ...tasks.blockchain import register_blockchain_evidence
    BLOCKCHAIN_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Blockchain tasks not available: {e}")
    BLOCKCHAIN_AVAILABLE = False
    
try:
    from ...tasks.notifications import send_incident_notifications, send_incident_notifications_to_users
    NOTIFICATIONS_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Notification tasks not available: {e}")
    NOTIFICATIONS_AVAILABLE = False

router = APIRouter()

@router.post("/", response_model=schemas.IncidentOut)
def create_incident(
    incident: schemas.IncidentCreate,
    db: Session = Depends(get_db)
    # No auth for AI worker
):
    # For viewer reports, auto-create a default camera if none exists
    # Check if this is a viewer report
    is_viewer_report = incident.description and incident.description.startswith('[VIEWER REPORT]')
    
    camera = db.query(models.Camera).filter(models.Camera.id == incident.camera_id).first()
    if not camera:
        if is_viewer_report:
            # Auto-create a default "Manual Reports" camera for viewer submissions
            print(f"[INFO] Auto-creating default camera for viewer report")
            default_camera = models.Camera(
                id=incident.camera_id,
                name="Manual Reports (Viewer Submissions)",
                stream_url="manual",
                location="N/A - User Reported",
                is_active=True,
                admin_user_id=None  # No admin needed for manual reports
            )
            db.add(default_camera)
            try:
                db.commit()
                db.refresh(default_camera)
                print(f"[INFO] Created default camera with ID {default_camera.id}")
            except Exception as e:
                db.rollback()
                print(f"[WARNING] Could not create default camera: {e}")
                # Try to use any existing camera instead
                any_camera = db.query(models.Camera).first()
                if any_camera:
                    incident.camera_id = any_camera.id
                    print(f"[INFO] Using existing camera ID {any_camera.id} instead")
                else:
                    raise HTTPException(
                        status_code=500,
                        detail="No cameras available. Please contact administrator."
                    )
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Camera with id {incident.camera_id} not found. Please create a camera first."
            )
    
    created_incident = crud.create_incident(db, incident=incident)
    
    # Broadcast new incident via WebSocket
    try:
        from .websocket import manager
        import asyncio
        
        # Convert to IncidentOut schema for broadcasting
        incident_out = schemas.IncidentOut.from_orm(created_incident)
        
        # Broadcast in background thread to not block response
        def broadcast_incident():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(manager.broadcast(incident_out))
                loop.close()
                print(f"✅ WebSocket broadcast sent for incident {created_incident.id}")
            except Exception as e:
                print(f"⚠️ WebSocket broadcast failed: {e}")
        
        import threading
        broadcast_thread = threading.Thread(target=broadcast_incident, daemon=True)
        broadcast_thread.start()
        
    except Exception as e:
        print(f"⚠️ WebSocket broadcast error: {e}")
    
    # Trigger background tasks without blocking the response
    def run_background_tasks():
        try:
            # Try to run background tasks with short timeout
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                # Submit tasks with 3-second timeout each
                if BLOCKCHAIN_AVAILABLE:
                    blockchain_future = executor.submit(register_blockchain_evidence.delay, created_incident.id)
                else:
                    print("⚠️ Blockchain registration skipped - not available")
                    
                if NOTIFICATIONS_AVAILABLE:
                    notification_future = executor.submit(send_incident_notifications.delay, created_incident.id)
                else:
                    print("⚠️ Notifications skipped - not available")
                
                try:
                    if BLOCKCHAIN_AVAILABLE:
                        blockchain_future.result(timeout=3)
                    if NOTIFICATIONS_AVAILABLE:
                        notification_future.result(timeout=3)
                    print(f"✅ Background tasks completed for incident {created_incident.id}")
                except concurrent.futures.TimeoutError:
                    print(f"⚠️ Background tasks timed out for incident {created_incident.id}")
                
        except Exception as e:
            print(f"⚠️ Background tasks failed: {e}")
            # Don't block the response
    
    # Run in separate thread to never block the API response
    import threading
    thread = threading.Thread(target=run_background_tasks, daemon=True)
    thread.start()
    
    return created_incident

@router.get("/", response_model=List[schemas.IncidentOut])
def read_incidents(
    skip: int = 0,
    limit: int = 10000,
    camera_id: Optional[int] = None,
    type_: Optional[schemas.IncidentTypeEnum] = None,
    severity: Optional[schemas.SeverityEnum] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    acknowledged: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # Role-based filtering (use lowercase for case-insensitive comparison)
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    role_str = str(role).lower()
    
    if role_str == "admin":
        # Admin sees all
        incidents = crud.get_incidents(
            db, skip, limit, camera_id, type_, severity, start_time, end_time, acknowledged
        )
    elif role_str == "security":
        # Security: only incidents assigned to them
        incidents = crud.get_incidents(
            db, skip, limit, camera_id, type_, severity, start_time, end_time, acknowledged,
            assigned_user_id=current_user.id
        )
    else:
        # Viewer/user: incidents from their own cameras OR AI-generated incidents (camera_id >= 29)
        # This allows viewers to see AI worker incidents even if they don't own the camera
        
        # Get ALL incidents first
        all_incidents = crud.get_incidents(
            db, skip, limit, camera_id, type_, severity, start_time, end_time, acknowledged
        )
        
        # Filter to include:
        # 1. Incidents from cameras they own (admin_user_id = current_user.id)  
        # 2. Incidents assigned directly to them (assigned_user_id = current_user.id)
        # 3. AI camera incidents (camera_id >= 29) - available to ALL viewers
        filtered_incidents = []
        for incident in all_incidents:
            camera_owner_id = incident.camera.admin_user_id if incident.camera else None
            assigned_user_id = incident.assigned_user_id
            
            # Include if user owns camera OR incident assigned to user OR AI camera
            if (camera_owner_id == current_user.id or 
                assigned_user_id == current_user.id or 
                incident.camera_id >= 29):
                filtered_incidents.append(incident)
        
        incidents = filtered_incidents
        
    # Debug: Log incident counts and first incident info
    print(f"[incidents] User {current_user.username} (role: {role_str}) sees {len(incidents)} incidents")
    if incidents:
        first = incidents[0]
        camera_owner = first.camera.admin_user_id if first.camera else None
        print(f"[incidents] First incident #{first.id}: camera_id={first.camera_id}, owner={camera_owner}, evidence_count={len(first.evidence_items)}")
    
    return incidents

@router.get("/{incident_id}", response_model=schemas.IncidentOut)
def read_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    incident = crud.get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get user role
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    role_str = str(role).lower()
    
    # Admin can see everything
    if role_str == "admin":
        return incident
    
    # Check access for non-admin users
    camera = incident.camera
    camera_owner_id = camera.admin_user_id if camera else None
    
    # User can see incident if:
    # 1. They own the camera
    # 2. Incident is assigned to them
    # 3. It's an AI camera incident (camera_id >= 29)
    has_access = (
        camera_owner_id == current_user.id or
        incident.assigned_user_id == current_user.id or
        incident.camera_id >= 29
    )
    
    if not has_access:
        raise HTTPException(status_code=403, detail="No access to this incident")
    
    return incident

@router.put("/{incident_id}/acknowledge", response_model=schemas.IncidentOut)
def acknowledge_incident(
    incident_id: int,
    acknowledged: bool,
    db: Session = Depends(get_db),
    current_user = Depends(role_check(["admin", "security", "viewer"]))
):
    updated = crud.update_incident_acknowledged(db, incident_id, acknowledged, current_user.id if acknowledged else None)
    if not updated:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Update related notifications
    for notif in updated.notifications:
        if acknowledged:
            notif.acknowledged_at = datetime.utcnow()
    db.commit()
    
    # If security personnel acknowledged, notify admin and incident owner
    if acknowledged and current_user.role == "security":
        # Get all admin users
        admin_users = db.query(models.User).filter(
            models.User.role == models.RoleEnum.admin,
            models.User.is_active == True
        ).all()
        
        notify_user_ids = [u.id for u in admin_users]
        
        # Add the incident owner (reporter) to notification list
        if updated.owner_id and updated.owner_id not in notify_user_ids:
            owner = crud.get_user(db, updated.owner_id)
            if owner and owner.is_active:
                notify_user_ids.append(updated.owner_id)
        
        # Send notifications to admin and incident owner
        if notify_user_ids:
            if NOTIFICATIONS_AVAILABLE:
                try:
                    from ...tasks.notifications import send_acknowledgement_notification
                    send_acknowledgement_notification.delay(incident_id, current_user.id, notify_user_ids)
                except ImportError:
                    print("⚠️ Acknowledgement notifications not available")
            else:
                print("⚠️ Acknowledgement notifications not available")
    elif acknowledged and current_user.role == "admin":
        # If admin acknowledged, notify security personnel or reporter
        if updated.owner_id and updated.owner_id != current_user.id:
            owner = crud.get_user(db, updated.owner_id)
            if owner and owner.is_active:
                if NOTIFICATIONS_AVAILABLE:
                    try:
                        from ...tasks.notifications import send_acknowledgement_notification
                        send_acknowledgement_notification.delay(incident_id, current_user.id, [updated.owner_id])
                    except ImportError:
                        print("⚠️ Acknowledgement notifications not available")
                else:
                    print("⚠️ Acknowledgement notifications not available")
    
    return updated


@router.post("/{incident_id}/grant-access", response_model=dict)
def grant_access_endpoint(
    incident_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(role_check(["admin"])),
):
    """Grant access for an incident. Payload may include `role` or `user_ids` list.
    If `role` is provided, we register notifications for users with that role.
    If `user_ids` is provided, sends notifications to those users specifically.
    """
    incident = crud.get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    role = payload.get("role")
    user_ids = payload.get("user_ids")

    if role:
        # Find users with this role
        users = db.query(models.User).filter(models.User.role == models.RoleEnum(role), models.User.is_active == True).all()
        user_ids = [u.id for u in users]

    if not user_ids:
        return {"status": "no_op", "message": "No users provided or found for role"}

    # Create notification DB entries for each user and trigger async send
    if NOTIFICATIONS_AVAILABLE:
        send_incident_notifications_to_users.delay(incident_id, user_ids)
    else:
        print("⚠️ Notifications not available for grant access")

    return {"status": "queued" if NOTIFICATIONS_AVAILABLE else "no_notifications", "user_count": len(user_ids)}


@router.post("/{incident_id}/notify", response_model=dict)
def notify_incident_users(
    incident_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(role_check(["admin"])),
):
    """Assign incident to a security user and trigger notifications."""
    user_ids = payload.get("user_ids") or []
    if not user_ids:
        raise HTTPException(status_code=400, detail="user_ids required")

    incident = crud.get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Assign incident to the first security user in the list
    assigned_user_id = None
    for user_id in user_ids:
        user = crud.get_user(db, user_id)
        if user and user.role == models.RoleEnum.security:
            incident.assigned_user_id = user_id
            assigned_user_id = user_id
            db.commit()
            break  # Only assign to first valid security user
    
    if not assigned_user_id:
        raise HTTPException(status_code=400, detail="No valid security users provided")
    
    try:
        # Try to send notifications via Celery
        if NOTIFICATIONS_AVAILABLE:
            send_incident_notifications_to_users.delay(incident_id, user_ids)
            return {"status": "success", "assigned_to": assigned_user_id}
        else:
            return {"status": "success", "assigned_to": assigned_user_id, "note": "notifications_unavailable"}
    except Exception as e:
        # If Celery fails (not running), still return success since assignment worked
        print(f"Celery notification failed (worker not running?): {e}")
        return {"status": "success", "assigned_to": assigned_user_id}


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(role_check(["admin"])),
):
    """Delete an incident. Only admins can delete incidents."""
    incident = crud.get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Delete the incident (will also delete related evidence and notifications)
    try:
        crud.delete_incident(db, incident_id)
        return None  # 204 No Content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete incident: {str(e)}")