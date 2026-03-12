from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from . import models, schemas
from .core.security import pwd_context, verify_password, get_password_hash
from typing import Optional, List, Union, Mapping, Any
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError, OperationalError
from sqlalchemy.exc import IntegrityError
import logging

logger = logging.getLogger(__name__)

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
    """
    Delete a camera and ALL rows that depend on it, in correct FK order.

    Dependency chain (leaf → root):
      audit_logs        → evidence           → incidents → cameras
      evidence_shares   → evidence           → incidents → cameras
      evidence_blockchain                    → incidents → cameras
      sos_alerts                             → incidents → cameras
      evidence                               → incidents → cameras
      notifications                          → incidents → cameras
      incidents                                          → cameras
      detection_logs                                     → cameras
      camera_status                                      → cameras
      sensitivity_settings                               → cameras
      cameras
    """
    # Verify the camera exists before attempting deletion
    exists = db.query(models.Camera.id).filter(models.Camera.id == camera_id).scalar()
    if not exists:
        return False

    # Ordered statements: deepest dependents first, camera last.
    # Each runs as its own committed mini-transaction to ensure the next
    # statement sees the freed FK references.
    statements = [
        # Level 3: dependents of evidence
        (
            "DELETE FROM audit_logs WHERE evidence_id IN "
            "(SELECT id FROM evidence WHERE incident_id IN "
            "(SELECT id FROM incidents WHERE camera_id = :id))",
            {"id": camera_id},
        ),
        (
            "DELETE FROM evidence_shares WHERE evidence_id IN "
            "(SELECT id FROM evidence WHERE incident_id IN "
            "(SELECT id FROM incidents WHERE camera_id = :id))",
            {"id": camera_id},
        ),
        # Level 2: direct dependents of incidents (other than evidence)
        (
            "DELETE FROM evidence_blockchain WHERE incident_id IN "
            "(SELECT id FROM incidents WHERE camera_id = :id)",
            {"id": camera_id},
        ),
        (
            "DELETE FROM sos_alerts WHERE incident_id IN "
            "(SELECT id FROM incidents WHERE camera_id = :id)",
            {"id": camera_id},
        ),
        (
            "DELETE FROM evidence WHERE incident_id IN "
            "(SELECT id FROM incidents WHERE camera_id = :id)",
            {"id": camera_id},
        ),
        (
            "DELETE FROM notifications WHERE incident_id IN "
            "(SELECT id FROM incidents WHERE camera_id = :id)",
            {"id": camera_id},
        ),
        # Level 1: direct dependents of cameras
        ("DELETE FROM incidents WHERE camera_id = :id",            {"id": camera_id}),
        ("DELETE FROM detection_logs WHERE camera_id = :id",       {"id": camera_id}),
        ("DELETE FROM camera_status WHERE camera_id = :id",        {"id": camera_id}),
        ("DELETE FROM sensitivity_settings WHERE camera_id = :id", {"id": camera_id}),
        # Root
        ("DELETE FROM cameras WHERE id = :id",                     {"id": camera_id}),
    ]

    try:
        for sql, params in statements:
            try:
                db.execute(text(sql), params)
                db.commit()
                logger.debug("delete_camera: %s", sql)
            except Exception as exc:
                db.rollback()
                logger.warning("delete_camera: statement failed (continuing): %s -> %s", sql, exc)

        # Confirm the camera row is gone
        still_exists = db.query(models.Camera.id).filter(models.Camera.id == camera_id).scalar()
        if still_exists:
            logger.error("delete_camera: camera %s could not be deleted", camera_id)
            return False
        return True
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        logger.error("delete_camera: unexpected error: %s", exc)
        raise

# Incident CRUD
def get_incident(db: Session, incident_id: int) -> Optional[models.Incident]:
    return db.query(models.Incident).options(
        joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
        joinedload(models.Incident.assigned_user),
        joinedload(models.Incident.evidence_items)
    ).filter(models.Incident.id == incident_id).first()

def get_incidents(
    db: Session,
    skip: int = 0,
    limit: int = 10000,
    camera_id: Optional[int] = None,
    type: Optional[schemas.IncidentTypeEnum] = None,
    severity: Optional[schemas.SeverityEnum] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    acknowledged: Optional[bool] = None,
    assigned_user_id: Optional[int] = None,
    owner_user_id: Optional[int] = None
) -> List[models.Incident]:
    query = db.query(models.Incident).options(
        joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
        joinedload(models.Incident.assigned_user),
        joinedload(models.Incident.evidence_items)
    )
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
    if assigned_user_id is not None:
        query = query.filter(models.Incident.assigned_user_id == assigned_user_id)
    if owner_user_id is not None:
        # Only incidents from cameras owned by this user
        query = query.join(models.Camera, models.Incident.camera_id == models.Camera.id)
        query = query.filter(models.Camera.admin_user_id == owner_user_id)
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

def update_incident_acknowledged(db: Session, incident_id: int, acknowledged: bool, acknowledged_by_id: int = None) -> Optional[models.Incident]:
    from datetime import datetime, timezone as _tz
    db_incident = get_incident(db, incident_id)
    if db_incident:
        db_incident.acknowledged = acknowledged
        if acknowledged:
            db_incident.acknowledged_at = datetime.now(_tz.utc)
            db_incident.incident_status = models.IncidentStatusEnum.Acknowledged
        else:
            # Reverting acknowledgement
            db_incident.acknowledged_at = None
            db_incident.incident_status = models.IncidentStatusEnum.Pending
        if acknowledged and acknowledged_by_id:
            db_incident.assigned_user_id = acknowledged_by_id
        db.commit()
        db.refresh(db_incident)
        return db_incident
    return None

def delete_incident(db: Session, incident_id: int) -> bool:
    """
    Delete an incident and its related records (evidence, notifications).
    Uses bulk delete to avoid lazy loading issues.
    """
    try:
        # First delete related evidence and notifications
        db.execute(text("DELETE FROM evidence WHERE incident_id = :id"), {"id": incident_id})
        db.execute(text("DELETE FROM notifications WHERE incident_id = :id"), {"id": incident_id})
        
        # Then delete the incident itself
        deleted = db.query(models.Incident).filter(models.Incident.id == incident_id).delete(synchronize_session=False)
        db.commit()
        return bool(deleted)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete incident {incident_id}: {e}")
        raise

# Evidence CRUD
def create_evidence(db: Session, evidence: schemas.EvidenceCreate) -> models.Evidence:
    # Debug: print what we're receiving
    evidence_data = evidence.dict(exclude_unset=True)
    print(f"[CRUD] Creating evidence with data: {evidence_data}")

    # Handle schema variations: extra_metadata vs metadata/metadata_
    metadata_value = None
    for key in ("extra_metadata", "metadata", "metadata_"):
        if hasattr(evidence, key):
            try:
                metadata_value = getattr(evidence, key)
            except Exception:
                metadata_value = None
            if metadata_value is not None:
                break

    # Explicitly create Evidence to avoid Pydantic field issues
    db_evidence = models.Evidence(
        incident_id=evidence_data.get("incident_id"),
        file_path=evidence_data.get("file_path"),
        sha256_hash=evidence_data.get("sha256_hash"),
        file_type=evidence_data.get("file_type"),
        extra_metadata=metadata_value,
        blockchain_tx_hash=evidence_data.get("blockchain_tx_hash"),
        blockchain_hash=evidence_data.get("blockchain_hash"),
    )

    db.add(db_evidence)
    db.commit()
    db.refresh(db_evidence)
    print(f"[CRUD] Evidence created successfully with ID: {db_evidence.id}")
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


# ===================================================================
# EvidenceBlockchain CRUD
# ===================================================================

def get_blockchain_record_by_incident(
    db: Session, incident_id: int
) -> Optional[models.EvidenceBlockchain]:
    """Return the blockchain record for a given incident, or None."""
    return (
        db.query(models.EvidenceBlockchain)
        .filter(models.EvidenceBlockchain.incident_id == incident_id)
        .first()
    )


def get_all_blockchain_records(
    db: Session, skip: int = 0, limit: int = 100
) -> List[models.EvidenceBlockchain]:
    """Return all blockchain records with simple pagination."""
    return (
        db.query(models.EvidenceBlockchain)
        .order_by(models.EvidenceBlockchain.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ===================================================================
# SOS Alert CRUD
# ===================================================================

def get_sos_alert_by_incident(db: Session, incident_id: int) -> Optional[models.SosAlert]:
    """Return the SosAlert for the given incident, or None."""
    return (
        db.query(models.SosAlert)
        .filter(models.SosAlert.incident_id == incident_id)
        .first()
    )


def get_sos_alert(db: Session, sos_id: int) -> Optional[models.SosAlert]:
    """Return a SosAlert by primary key, or None."""
    return db.query(models.SosAlert).filter(models.SosAlert.id == sos_id).first()


def get_all_sos_alerts(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
) -> List[models.SosAlert]:
    """Return all SOS alerts with optional status filter and pagination."""
    q = db.query(models.SosAlert)
    if status_filter:
        q = q.filter(models.SosAlert.alert_status == status_filter)
    return q.order_by(models.SosAlert.triggered_at.desc()).offset(skip).limit(limit).all()


def get_active_sos_count(db: Session) -> int:
    """Return count of currently active (unhandled) SOS alerts."""
    return (
        db.query(models.SosAlert)
        .filter(models.SosAlert.alert_status == "active")
        .count()
    )
