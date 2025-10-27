from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from ... import crud, schemas
from ...core.database import get_db
from ...dependencies import get_current_user, role_check
from ...tasks.blockchain import register_blockchain_evidence
from ...tasks.notifications import send_incident_notifications

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