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
    created_incident = crud.create_incident(db, incident=incident)
    # Trigger async tasks for blockchain and notifications
    register_blockchain_evidence.delay(created_incident.id)
    send_incident_notifications.delay(created_incident.id)
    return created_incident

@router.get("/", response_model=List[schemas.IncidentOut])
def read_incidents(
    skip: int = 0,
    limit: int = 100,
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
    current_user = Depends(role_check(["security", "viewer"]))
):
    updated = crud.update_incident_acknowledged(db, incident_id, acknowledged)
    if not updated:
        raise HTTPException(status_code=404, detail="Incident not found")
    # Update related notifications
    for notif in updated.notifications:
        if acknowledged:
            notif.acknowledged_at = datetime.utcnow()
    db.commit()
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
    """Trigger notifications for a list of user IDs for a specific incident."""
    user_ids = payload.get("user_ids") or []
    if not user_ids:
        raise HTTPException(status_code=400, detail="user_ids required")

    incident = crud.get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    send_incident_notifications_to_users.delay(incident_id, user_ids)
    return {"status": "queued", "user_count": len(user_ids)}