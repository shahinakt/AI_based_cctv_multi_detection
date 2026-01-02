from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user, role_check
from ...tasks.blockchain import register_blockchain_evidence
from ...tasks.notifications import send_incident_notifications
from ...tasks.notifications import send_incident_notifications_to_users

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
    
    # Trigger async tasks for blockchain and notifications (gracefully handle if Celery not running)
    try:
        register_blockchain_evidence.delay(created_incident.id)
        send_incident_notifications.delay(created_incident.id)
    except Exception as e:
        print(f"Warning: Could not trigger background tasks: {e}")
        # Don't fail the request if background tasks fail
    
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
    # Access control: viewers see only unacknowledged by default
    if current_user.role == "viewer" and acknowledged is None:
        acknowledged = False
    incidents = crud.get_incidents(
        db, skip, limit, camera_id, type_, severity, start_time, end_time, acknowledged
    )
    # Debug: Log first incident data
    if incidents:
        first = incidents[0]
        print(f"[DEBUG] First incident #{first.id}: camera={first.camera}, admin_user={first.camera.admin_user if first.camera else None}")
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
    # Check access via camera
    camera = incident.camera
    if current_user.role != "admin" and camera.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No access to this incident")
    return incident

@router.put("/{incident_id}/acknowledge", response_model=schemas.IncidentOut)
def acknowledge_incident(
    incident_id: int,
    acknowledged: bool,
    db: Session = Depends(get_db),
    current_user = Depends(role_check(["admin", "security", "viewer"]))
):
    updated = crud.update_incident_acknowledged(db, incident_id, acknowledged)
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
            from ...tasks.notifications import send_acknowledgement_notification
            send_acknowledgement_notification.delay(incident_id, current_user.id, notify_user_ids)
    
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
    send_incident_notifications_to_users.delay(incident_id, user_ids)

    return {"status": "queued", "user_count": len(user_ids)}


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
        send_incident_notifications_to_users.delay(incident_id, user_ids)
        return {"status": "success", "assigned_to": assigned_user_id}
    except Exception as e:
        # If Celery fails (not running), still return success since assignment worked
        print(f"Celery notification failed (worker not running?): {e}")
        return {"status": "success", "assigned_to": assigned_user_id}