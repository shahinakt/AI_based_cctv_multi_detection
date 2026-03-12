"""
Minimal incidents router for dashboard - just the essentials
INCLUDES: POST endpoint for AI worker to create incidents
INCLUDES: POST /acknowledge/{incident_id} for SOS alert flow
"""
from fastapi import APIRouter, Depends, HTTPException, status as http_status
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime, timezone
from ... import models, schemas, crud
from ...core.database import get_db
from ...dependencies import get_current_user

# SOS service – imported with graceful fallback
try:
    from ...services.sos_service import (
        schedule_sos_timer,
        cancel_sos_timer,
        is_high_priority,
    )
    SOS_SERVICE_AVAILABLE = True
except Exception as _sos_err:
    print(f"[incidents_simple] SOS service not available: {_sos_err}")
    SOS_SERVICE_AVAILABLE = False

# Celery SOS task – additional safety net when Redis is available
try:
    from ...tasks.sos import check_and_trigger_sos as _celery_sos_task
    CELERY_SOS_AVAILABLE = True
except Exception:
    CELERY_SOS_AVAILABLE = False

# Celery notification task
try:
    from ...tasks.notifications import send_incident_notifications
    NOTIFICATIONS_AVAILABLE = True
except Exception:
    NOTIFICATIONS_AVAILABLE = False

# Create router
router = APIRouter()

@router.post("/", response_model=schemas.IncidentOut)
def create_incident(
    incident: schemas.IncidentCreate,
    db: Session = Depends(get_db)
    # No auth for AI worker
):
    """Create a new incident (used by AI worker and viewer reports)"""
    # For viewer reports, auto-create a default camera if none exists
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

    print(f"✅ Incident created: ID={created_incident.id}, Type={created_incident.type}, Camera={created_incident.camera_id}")

    # -----------------------------------------------------------------------
    # SOS ALERT: Schedule 60-second acknowledgement timer for high-priority
    # incidents (severity = high or critical).
    # -----------------------------------------------------------------------
    _severity = created_incident.severity
    _is_high = SOS_SERVICE_AVAILABLE and is_high_priority(_severity)

    if _is_high:
        # 1. Thread-based timer (always available, no Redis needed)
        schedule_sos_timer(created_incident.id)
        print(f"⏱ SOS timer started for incident #{created_incident.id} (severity={_severity})")

        # 2. Celery delayed task as additional safety net (only when Redis is up)
        if CELERY_SOS_AVAILABLE:
            try:
                _celery_sos_task.apply_async(
                    args=[created_incident.id],
                    countdown=60,
                )
                print(f"📋 Celery SOS task queued for incident #{created_incident.id}")
            except Exception as _ce:
                print(f"⚠️ Celery SOS task could not be queued: {_ce} (threading.Timer is active)")

        # 3. Send notifications to admins about high-priority incident
        if NOTIFICATIONS_AVAILABLE:
            try:
                send_incident_notifications.delay(created_incident.id)
            except Exception as _ne:
                print(f"⚠️ Could not queue notification task: {_ne}")

    return created_incident

@router.get("/", response_model=List[schemas.IncidentOut])
def get_incidents_for_dashboard(
    limit: int = 10000,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get incidents for dashboard count - minimal version"""
    
    try:
        # Get user role as string
        role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        role_str = str(role).lower()
        
        # Admin sees all incidents
        if role_str == "admin":
            incidents = db.query(models.Incident).options(
                joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
                joinedload(models.Incident.assigned_user),
                joinedload(models.Incident.evidence_items)
            ).order_by(models.Incident.timestamp.desc()).limit(limit).all()
        else:
            # Non-admin users: Get all incidents and filter in Python to avoid SQL join issues
            all_incidents = db.query(models.Incident).options(
                joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
                joinedload(models.Incident.assigned_user),
                joinedload(models.Incident.evidence_items)
            ).order_by(models.Incident.timestamp.desc()).limit(limit).all()
            
            filtered = []
            for incident in all_incidents:
                # Check if incident should be visible to this user
                camera_owner_id = incident.camera.admin_user_id if incident.camera else None
                assigned_user_id = incident.assigned_user_id
                incident_description = incident.description or ""

                # Include if:
                # 1. User owns the camera the incident was detected on
                # 2. Incident is explicitly assigned to this user
                # 3. SOS alerts or viewer reports – visible to security + admin
                is_sos_or_report = (
                    incident_description.startswith('[SOS ALERT]') or
                    incident_description.startswith('[VIEWER REPORT]')
                )

                if (camera_owner_id == current_user.id or
                        assigned_user_id == current_user.id or
                        (role_str == 'security' and is_sos_or_report)):
                    filtered.append(incident)
            
            incidents = filtered
            print(f"[incidents_simple] User {current_user.username} (role: {role_str}) sees {len(incidents)} incidents")
        
        return incidents
        
    except Exception as e:
        print(f"Error loading incidents: {e}")
        import traceback
        traceback.print_exc()
        # Return empty list instead of error to not break dashboard
        return []

@router.get("/count")
def get_incidents_count(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get just the count for dashboard"""
    
    try:
        # Get user role as string
        role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        role_str = str(role).lower()
        
        if role_str == "admin":
            total = db.query(models.Incident).count()
            open_count = db.query(models.Incident).filter(models.Incident.acknowledged == False).count()
        else:
            # Get all incidents and filter in Python
            all_incidents = db.query(models.Incident).all()
            
            filtered_total = 0
            filtered_open = 0
            
            for incident in all_incidents:
                camera_owner_id = incident.camera.admin_user_id if incident.camera else None
                assigned_user_id = incident.assigned_user_id
                incident_description = incident.description or ""
                is_sos_or_report = (
                    incident_description.startswith('[SOS ALERT]') or
                    incident_description.startswith('[VIEWER REPORT]')
                )

                # Check if visible to user (mirrors GET / filter logic)
                is_visible = (
                    camera_owner_id == current_user.id or
                    assigned_user_id == current_user.id or
                    (role_str == 'security' and is_sos_or_report)
                )

                if is_visible:
                    filtered_total += 1
                    if not incident.acknowledged:
                        filtered_open += 1
            
            total = filtered_total
            open_count = filtered_open
        
        return {"total": total, "open": open_count}
        
    except Exception as e:
        print(f"Error getting incident count: {e}")
        import traceback
        traceback.print_exc()
        return {"total": 0, "open": 0}

@router.get("/{incident_id}", response_model=schemas.IncidentOut)
def get_single_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a single incident by ID with full details including evidence"""
    
    # Fetch incident with all related data
    incident = db.query(models.Incident).options(
        joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
        joinedload(models.Incident.assigned_user),
        joinedload(models.Incident.evidence_items)
    ).filter(models.Incident.id == incident_id).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get user role as string
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    role_str = str(role).lower()
    
    # Admin can see all incidents
    if role_str == "admin":
        print(f"[get_single_incident] Admin accessing incident #{incident_id}")
        return incident
    
    # Check access for non-admin users
    camera_owner_id = incident.camera.admin_user_id if incident.camera else None
    assigned_user_id = incident.assigned_user_id
    incident_description = incident.description or ""
    is_sos_or_report = (
        incident_description.startswith('[SOS ALERT]') or
        incident_description.startswith('[VIEWER REPORT]')
    )

    # User can access if:
    # 1. They own the camera the incident belongs to
    # 2. Incident is explicitly assigned to them
    # 3. Security role can view SOS alerts and viewer reports
    has_access = (
        camera_owner_id == current_user.id or
        assigned_user_id == current_user.id or
        (role_str == 'security' and is_sos_or_report)
    )
    
    if not has_access:
        print(f"[get_single_incident] User {current_user.username} denied access to incident #{incident_id}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to view this incident"
        )
    
    print(f"[get_single_incident] User {current_user.username} accessing incident #{incident_id}, evidence count: {len(incident.evidence_items)}")
    return incident


@router.put("/{incident_id}/acknowledge", response_model=schemas.IncidentOut)
def acknowledge_incident(
    incident_id: int,
    acknowledged: bool,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Acknowledge or un-acknowledge an incident"""
    
    # Update incident acknowledgement status
    updated = crud.update_incident_acknowledged(
        db, incident_id, acknowledged, 
        current_user.id if acknowledged else None
    )
    
    if not updated:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    print(f"✅ Incident #{incident_id} {'acknowledged' if acknowledged else 'un-acknowledged'} by {current_user.username}")
    
    return updated


# ---------------------------------------------------------------------------
# POST /incidents/acknowledge/{incident_id}  – Mobile/Dashboard SOS acknowledge
# ---------------------------------------------------------------------------

@router.post(
    "/acknowledge/{incident_id}",
    response_model=schemas.AcknowledgeResponse,
    summary="Acknowledge a high-priority incident (cancels pending SOS timer)",
)
def post_acknowledge_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Called when a user taps **Acknowledge Incident** in the dashboard/mobile app.

    Workflow:
    1. Validate incident exists and is not yet acknowledged.
    2. Set acknowledged = True, incident_status = Acknowledged.
    3. Cancel the in-memory SOS timer (threading.Timer) if still pending.
    4. Return confirmation with time of acknowledgement.
    """
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Incident {incident_id} not found.",
        )

    if incident.acknowledged:
        ack_at = incident.acknowledged_at or incident.timestamp
        return schemas.AcknowledgeResponse(
            success=True,
            message="Incident was already acknowledged.",
            incident_id=incident_id,
            incident_status=(
                incident.incident_status.value
                if hasattr(incident.incident_status, "value")
                else str(incident.incident_status)
            ) if incident.incident_status else "Acknowledged",
            sos_cancelled=False,
            acknowledged_at=ack_at,
        )

    # Update the incident
    updated = crud.update_incident_acknowledged(db, incident_id, True, current_user.id)
    if not updated:
        raise HTTPException(status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Update failed.")

    # Cancel SOS timer
    sos_cancelled = False
    if SOS_SERVICE_AVAILABLE:
        sos_cancelled = cancel_sos_timer(incident_id)

    ack_time = updated.acknowledged_at or datetime.now(timezone.utc)

    print(
        f"✅ [SOS] Incident #{incident_id} acknowledged by {current_user.username} "
        f"(SOS timer cancelled: {sos_cancelled})"
    )

    return schemas.AcknowledgeResponse(
        success=True,
        message=(
            "Incident acknowledged. SOS alert cancelled."
            if sos_cancelled
            else "Incident acknowledged."
        ),
        incident_id=incident_id,
        incident_status=(
            updated.incident_status.value
            if hasattr(updated.incident_status, "value")
            else str(updated.incident_status)
        ) if updated.incident_status else "Acknowledged",
        sos_cancelled=sos_cancelled,
        acknowledged_at=ack_time,
    )


@router.post("/{incident_id}/grant-access", response_model=dict)
def grant_access_endpoint(
    incident_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Grant access for an incident. Payload may include 'role' or 'user_ids' list."""
    
    # Get user role as string
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    role_str = str(role).lower()
    
    # Only admin can grant access
    if role_str != "admin":
        raise HTTPException(status_code=403, detail="Only admins can grant access")
    
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    requested_role = payload.get("role")
    user_ids = payload.get("user_ids")

    if requested_role:
        # Find users with this role
        users = db.query(models.User).filter(
            models.User.role == models.RoleEnum(requested_role),
            models.User.is_active == True
        ).all()
        user_ids = [u.id for u in users]

    if not user_ids:
        return {"status": "no_op", "message": "No users provided or found for role"}

    print(f"✅ Access granted to incident #{incident_id} for {len(user_ids)} users by {current_user.username}")
    
    return {"status": "success", "user_count": len(user_ids)}


@router.post("/{incident_id}/notify", response_model=dict)
def notify_incident_users(
    incident_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Assign incident to a security user and trigger notifications. Admin only."""
    # Check role
    role_str = str(current_user.role.value).lower() if hasattr(current_user.role, 'value') else str(current_user.role).lower()
    if role_str != "admin":
        raise HTTPException(status_code=403, detail="Only admins can notify incidents")
    
    user_ids = payload.get("user_ids") or []
    if not user_ids:
        raise HTTPException(status_code=400, detail="user_ids required")

    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Assign incident to the first security user in the list
    assigned_user_id = None
    for user_id in user_ids:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user and user.role == models.RoleEnum.security:
            incident.assigned_user_id = user_id
            assigned_user_id = user_id
            db.commit()
            break  # Only assign to first valid security user
    
    if not assigned_user_id:
        raise HTTPException(status_code=400, detail="No valid security users provided")
    
    print(f"✅ Incident #{incident_id} assigned to user #{assigned_user_id} by {current_user.username}")
    
    # Note: If you have Celery notifications enabled, uncomment:
    # try:
    #     from ...tasks.notifications import send_incident_notifications_to_users
    #     send_incident_notifications_to_users.delay(incident_id, user_ids)
    # except Exception as e:
    #     print(f"⚠️ Notification task failed: {e}")
    
    return {"status": "success", "assigned_to": assigned_user_id}