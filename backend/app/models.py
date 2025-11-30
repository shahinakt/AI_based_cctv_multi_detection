"""
backend/app/models.py - FIXED VERSION
Added CameraStatus model for real-time streaming tracking
"""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float, Boolean, Text, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from enum import Enum as PyEnum
from .core.database import Base


class RoleEnum(PyEnum):
    admin = "admin"
    security = "security"
    viewer = "viewer"


class IncidentTypeEnum(PyEnum):
    abuse_violence = "abuse_violence"
    theft = "theft"
    fall_health = "fall_health"
    accident_car_theft = "accident_car_theft"


class SeverityEnum(PyEnum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(SQLEnum(RoleEnum, name="role_enum"), default=RoleEnum.viewer, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    incidents = relationship("Incident", back_populates="assigned_user")
    managed_cameras = relationship("Camera", back_populates="admin_user")
    device_tokens = relationship("DeviceToken", back_populates="user")


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    # Backwards-compatible mapping: the DB column is `rtsp_url` (created by migrations),
    # but the application uses the attribute name `stream_url`. Bind the ORM attribute
    # to the existing column name to avoid schema mismatch errors.
    stream_url = Column('rtsp_url', String, nullable=False)
    location = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    admin_user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    

    # Relationships
    admin_user = relationship("User", back_populates="managed_cameras")
    sensitivity_settings = relationship(
        "SensitivitySettings", back_populates="camera", uselist=False
    )
    incidents = relationship("Incident", back_populates="camera")
    detection_logs = relationship("DetectionLog", back_populates="camera")
    status = relationship("CameraStatus", back_populates="camera", uselist=False)


class CameraStatus(Base):
    """
    NEW MODEL: Real-time camera streaming status
    Updated by AI worker during processing
    """
    __tablename__ = "camera_status"
    
    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), unique=True, nullable=False)
    
    # Streaming status: 'starting', 'running', 'stopped', 'error'
    status = Column(String(20), default="inactive")
    error_message = Column(Text, nullable=True)
    
    # Performance metrics
    fps = Column(Float, default=0.0)
    last_frame_time = Column(DateTime(timezone=True), nullable=True)
    total_frames = Column(Integer, default=0)
    total_incidents = Column(Integer, default=0)
    
    # Device info
    processing_device = Column(String(20), nullable=True)  # 'cuda:0' or 'cpu'
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    camera = relationship("Camera", back_populates="status")


class Incident(Base):
    __tablename__ = "incidents"
    
    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=False, index=True)
    type = Column(SQLEnum(IncidentTypeEnum, name="incident_type_enum"), nullable=False, index=True)
    severity = Column(SQLEnum(SeverityEnum, name="severity_enum"), nullable=False, index=True)
    severity_score = Column(Float, nullable=False)
    description = Column(Text)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id"))
    acknowledged = Column(Boolean, default=False)
    blockchain_tx = Column(String)
    
    camera = relationship("Camera", back_populates="incidents")
    assigned_user = relationship("User", back_populates="incidents")
    evidence_items = relationship("Evidence", back_populates="incident")
    notifications = relationship("Notification", back_populates="incident")


class Evidence(Base):
    __tablename__ = "evidence"
    
    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False, index=True)
    file_path = Column(String, nullable=False)
    sha256_hash = Column(String, nullable=False)
    file_type = Column(String)  # 'image' or 'video'
    description = Column(Text, nullable=True)
    extra_metadata = Column('metadata', JSON)
    uploaded_to_ipfs = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    incident = relationship("Incident", back_populates="evidence_items")


class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    device_token_id = Column(Integer, ForeignKey("device_tokens.id"))
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    acknowledged_at = Column(DateTime(timezone=True))
    type = Column(String, default="fcm")
    
    incident = relationship("Incident", back_populates="notifications")
    user = relationship("User")
    device_token = relationship("DeviceToken")


class DeviceToken(Base):
    __tablename__ = "device_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String, nullable=False)
    platform = Column(String, default="android")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", back_populates="device_tokens")
    notifications = relationship("Notification", back_populates="device_token")


class DetectionLog(Base):
    __tablename__ = "detection_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=False, index=True)
    event_type = Column(String)
    confidence = Column(Float)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    extra_metadata = Column('metadata', JSON)
    
    camera = relationship("Camera", back_populates="detection_logs")


class ModelVersion(Base):
    __tablename__ = "model_versions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    version = Column(String, nullable=False)
    path = Column(String, nullable=False)
    metrics = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SensitivitySettings(Base):
    __tablename__ = "sensitivity_settings"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), unique=True, nullable=False)
    confidence_threshold = Column(Float, default=0.5)
    persistence_frames = Column(Integer, default=5)
    cooldown_seconds = Column(Integer, default=30)
    severity_multiplier = Column(Float, default=1.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    camera = relationship("Camera", back_populates="sensitivity_settings")