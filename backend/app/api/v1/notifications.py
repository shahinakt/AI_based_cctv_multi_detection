from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user

router = APIRouter()

@router.post("/device-tokens", response_model=schemas.DeviceTokenOut)
def register_device_token(
    token: schemas.DeviceTokenCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    token.user_id = current_user.id
    return crud.create_device_token(db, token)

@router.get("/", response_model=List[schemas.NotificationOut])
def read_notifications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    notifications = crud.get_notifications_by_user(db, current_user.id, skip, limit)
    return [schemas.NotificationOut.from_orm(n) for n in notifications]

@router.put("/{notification_id}/ack", response_model=dict)
def acknowledge_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your notification")
    notification.acknowledged_at = datetime.utcnow()
    db.commit()
    return {"msg": "Notification acknowledged"}