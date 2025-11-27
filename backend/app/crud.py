from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from . import models, schemas
from .core.security import pwd_context, verify_password, get_password_hash
from typing import Optional, List
from datetime import datetime

# User CRUD
def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_users(db: Session, skip: int = 0, limit: int = 100) -> List[models.User]:
    """
    Return all users with simple pagination.
    Used by /api/v1/users (admin User Management).
    """
    return (
        db.query(models.User)
        .order_by(models.User.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.username == username).first()

def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    hashed_password = get_password_hash(user.password)

    # Map schema RoleEnum -> model RoleEnum (SQLAlchemy enum)
    role_value = user.role.value if hasattr(user.role, "value") else str(user.role)

    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        role=models.RoleEnum(role_value),  # 👈 use models.RoleEnum here
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate) -> Optional[models.User]:
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    update_data = user_update.dict(exclude_unset=True)
    if "password" in update_data:  # Handle password update if added to schema
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))
    for field, value in update_data.items():
        setattr(db_user, field, value)
    db.commit()
    db.refresh(db_user)
    return db_user

def delete_user(db: Session, user_id: int) -> bool:
    db_user = get_user(db, user_id)
    if db_user:
        db.delete(db_user)
        db.commit()
        return True
    return False

# Camera CRUD
def get_camera(db: Session, camera_id: int) -> Optional[models.Camera]:
    return db.query(models.Camera).filter(models.Camera.id == camera_id).first()

def get_cameras(db: Session, skip: int = 0, limit: int = 100, admin_user_id: Optional[int] = None) -> List[models.Camera]:
    query = db.query(models.Camera)
    if admin_user_id:
        query = query.filter(models.Camera.admin_user_id == admin_user_id)
    return query.offset(skip).limit(limit).all()

def create_camera(
    db: Session,
    camera: Union[schemas.CameraCreate, Mapping[str, Any]],
) -> models.Camera:
    """
    Create a camera from either a CameraCreate schema or a plain dict.
    Expects admin_user_id to already be included in the data.
    """
    if isinstance(camera, schemas.CameraCreate):
        data = camera.dict()
    else:
        data = dict(camera)

    db_camera = models.Camera(**data)
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)

    # Auto-create sensitivity settings (one-to-one)
    sensitivity = models.SensitivitySettings(camera_id=db_camera.id)
    db.add(sensitivity)
    db.commit()
    db.refresh(sensitivity)

    # Keep a reference on the Python object (not a DB column)
    db_camera.sensitivity_settings_id = sensitivity.id

    return db_camera

def update_camera(db: Session, camera_id: int, camera_update: schemas.CameraUpdate) -> Optional[models.Camera]:
    db_camera = get_camera(db, camera_id)
    if not db_camera:
        return None
    update_data = camera_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_camera, field, value)
    db.commit()
    db.refresh(db_camera)
    return db_camera

def delete_camera(db: Session, camera_id: int) -> bool:
    db_camera = get_camera(db, camera_id)
    if db_camera:
        db.delete(db_camera)
        db.commit()
        return True
    return False

# Incident CRUD
def get_incident(db: Session, incident_id: int) -> Optional[models.Incident]:
    return db.query(models.Incident).filter(models.Incident.id == incident_id).first()

def get_incidents(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    camera_id: Optional[int] = None,
    type: Optional[schemas.IncidentTypeEnum] = None,
    severity: Optional[schemas.SeverityEnum] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    acknowledged: Optional[bool] = None
) -> List[models.Incident]:
    query = db.query(models.Incident)
    if camera_id:
        query = query.filter(models.Incident.camera_id == camera_id)
    if type:
        query = query.filter(models.Incident.type == type)
    if severity:
        query = query.filter(models.Incident.severity == severity)
    if start_time and end_time:
        query = query.filter(models.Incident.timestamp >= start_time, models.Incident.timestamp <= end_time)
    if acknowledged is not None:
        query = query.filter(models.Incident.acknowledged == acknowledged)
    return query.order_by(models.Incident.timestamp.desc()).offset(skip).limit(limit).all()

def create_incident(db: Session, incident: schemas.IncidentCreate, assigned_user_id: Optional[int] = None) -> models.Incident:
    db_incident = models.Incident(
        camera_id=incident.camera_id,
        type=incident.type,
        severity=incident.severity,
        severity_score=incident.severity_score,
        description=incident.description,
        assigned_user_id=assigned_user_id
    )
    db.add(db_incident)
    db.commit()
    db.refresh(db_incident)
    return db_incident

def update_incident_acknowledged(db: Session, incident_id: int, acknowledged: bool) -> Optional[models.Incident]:
    db_incident = get_incident(db, incident_id)
    if db_incident:
        db_incident.acknowledged = acknowledged
        db.commit()
        db.refresh(db_incident)
        return db_incident
    return None

# Evidence CRUD
def create_evidence(db: Session, evidence: schemas.EvidenceCreate) -> models.Evidence:
    db_evidence = models.Evidence(**evidence.dict())
    db.add(db_evidence)
    db.commit()
    db.refresh(db_evidence)
    return db_evidence

def get_evidence(db: Session, evidence_id: int) -> Optional[models.Evidence]:
    return db.query(models.Evidence).filter(models.Evidence.id == evidence_id).first()

# Notification CRUD
def create_notification(db: Session, notification: schemas.NotificationCreate) -> models.Notification:
    db_notification = models.Notification(**notification.dict())
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

def get_notifications_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[models.Notification]:
    return db.query(models.Notification).filter(models.Notification.user_id == user_id).offset(skip).limit(limit).all()

# DeviceToken CRUD
def create_device_token(db: Session, token: schemas.DeviceTokenCreate) -> models.DeviceToken:
    db_token = models.DeviceToken(**token.dict())
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token

# DetectionLog CRUD
def create_detection_log(db: Session, log: schemas.DetectionLogCreate) -> models.DetectionLog:
    db_log = models.DetectionLog(**log.dict())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

# ModelVersion CRUD
def create_model_version(db: Session, version: schemas.ModelVersionCreate) -> models.ModelVersion:
    db_version = models.ModelVersion(**version.dict())
    db.add(db_version)
    db.commit()
    db.refresh(db_version)
    return db_version

# SensitivitySettings CRUD
def get_sensitivity_settings(db: Session, camera_id: int) -> Optional[models.SensitivitySettings]:
    return db.query(models.SensitivitySettings).filter(models.SensitivitySettings.camera_id == camera_id).first()

def update_sensitivity_settings(db: Session, camera_id: int, settings_update: schemas.SensitivitySettingsUpdate) -> Optional[models.SensitivitySettings]:
    db_settings = get_sensitivity_settings(db, camera_id)
    if not db_settings:
        return None
    update_data = settings_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_settings, field, value)
    db.commit()
    db.refresh(db_settings)
    return db_settings

def get_cameras_by_admin(db: Session, admin_user_id: int) -> List[models.Camera]:
    return (
        db.query(models.Camera)
        .filter(models.Camera.admin_user_id == admin_user_id)
        .all()
    )

def get_incidents_for_admin_cameras(db: Session, admin_user_id: int) -> List[models.Incident]:
    return (
        db.query(models.Incident)
        .join(models.Camera, models.Incident.camera_id == models.Camera.id)
        .filter(models.Camera.admin_user_id == admin_user_id)
        .all()
    )