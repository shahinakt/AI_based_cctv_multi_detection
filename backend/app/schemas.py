"""
backend/app/schemas.py - FIXED VERSION
Added CameraStatus schemas
"""
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict, Any, Annotated
from datetime import datetime
from enum import Enum
from .models import RoleEnum as ModelRoleEnum, IncidentTypeEnum, SeverityEnum


class RoleEnum(str, Enum):
    admin = "admin"
    security = "security"
    viewer = "viewer"


class IncidentTypeEnum(str, Enum):
    abuse_violence = "abuse_violence"
    theft = "theft"
    fall_health = "fall_health"
    accident_car_theft = "accident_car_theft"


class SeverityEnum(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


# User schemas
class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr


class UserCreate(UserBase):
    password: Annotated[str, Field(min_length=8, max_length=72)]
    role: RoleEnum = RoleEnum.viewer


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    role: Optional[RoleEnum] = None

    @validator("role")
    def validate_role(cls, v):
        if v and v not in [r.value for r in ModelRoleEnum]:
            raise ValueError("Invalid role")
        return v


class UserOut(UserBase):
    id: int
    role: RoleEnum
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Camera schemas
from typing import Optional
from pydantic import BaseModel, Field, validator

class CameraBase(BaseModel):
    name: str = Field(..., max_length=100)
    stream_url: str = Field(
        ...,
        description="RTSP/HTTP URL or webcam index (0,1,2)"
    )
    location: Optional[str] = None

    @validator("stream_url")
    def validate_stream_url(cls, v: str) -> str:
        v = v.strip()
        # Allow webcam indexes "0", "1", "2"
        if v.isdigit():
            return v
        # Allow RTSP/HTTP URLs
        if v.startswith(("rtsp://", "http://", "https://")):
            return v
        raise ValueError("stream_url must be webcam index (0/1/2) or RTSP/HTTP URL")


class CameraCreate(CameraBase):
    """
    Request body from frontend when creating a camera.
    admin_user_id will be taken from the current logged-in user,
    NOT from the payload.
    """
    pass


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    stream_url: Optional[str] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None

    @validator("stream_url")
    def validate_stream_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if v.isdigit():
            return v
        if v.startswith(("rtsp://", "http://", "https://")):
            return v
        raise ValueError("stream_url must be webcam index or RTSP/HTTP URL")


class CameraOut(CameraBase):
    id: int
    admin_user_id: int
    sensitivity_settings_id: Optional[int] = None
    is_active: bool
    created_at: datetime

    # Optional streaming status fields
    streaming_status: Optional[str] = None
    fps: Optional[float] = None
    last_frame_time: Optional[datetime] = None

    class Config:
        from_attributes = True


# NEW: Camera Status schemas
class CameraStatusOut(BaseModel):
    """Real-time camera streaming status"""
    id: int
    camera_id: int
    status: str  # 'starting', 'running', 'stopped', 'error'
    error_message: Optional[str] = None
    fps: float
    last_frame_time: Optional[datetime] = None
    total_frames: int
    total_incidents: int
    processing_device: Optional[str] = None
    started_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class CameraStatusUpdate(BaseModel):
    """For AI worker to update camera status"""
    status: str
    error_message: Optional[str] = None
    fps: Optional[float] = None
    total_frames: Optional[int] = None
    total_incidents: Optional[int] = None
    processing_device: Optional[str] = None


# Incident schemas
class IncidentBase(BaseModel):
    camera_id: int
    type: IncidentTypeEnum
    severity: SeverityEnum
    severity_score: float = Field(..., ge=0, le=100)
    description: Optional[str] = None


class IncidentCreate(IncidentBase):
    pass


class IncidentOut(IncidentBase):
    id: int
    timestamp: datetime
    assigned_user_id: Optional[int] = None
    acknowledged: bool
    blockchain_tx: Optional[str] = None

    class Config:
        from_attributes = True


# Evidence schemas
class EvidenceBase(BaseModel):
    incident_id: int
    file_path: str
    sha256_hash: str
    file_type: str
    metadata_: Optional[Dict[str, Any]] = None


class EvidenceCreate(EvidenceBase):
    pass


class EvidenceOut(EvidenceBase):
    id: int
    uploaded_to_ipfs: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Notification schemas
class NotificationBase(BaseModel):
    incident_id: int
    user_id: int
    type: str = "fcm"


class NotificationCreate(NotificationBase):
    device_token_id: Optional[int] = None


class NotificationOut(NotificationBase):
    id: int
    sent_at: datetime
    acknowledged_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# DeviceToken schemas
class DeviceTokenBase(BaseModel):
    user_id: int
    token: str
    platform: Optional[str] = "android"


class DeviceTokenCreate(DeviceTokenBase):
    pass


class DeviceTokenOut(DeviceTokenBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# DetectionLog schemas
class DetectionLogCreate(BaseModel):
    camera_id: int
    event_type: str
    confidence: float
    metadata_: Optional[Dict[str, Any]] = None


# ModelVersion schemas
class ModelVersionCreate(BaseModel):
    name: str
    version: str
    path: str
    metrics: Optional[Dict[str, float]] = None


# SensitivitySettings schemas
class SensitivitySettingsUpdate(BaseModel):
    confidence_threshold: Optional[float] = None
    persistence_frames: Optional[int] = None
    cooldown_seconds: Optional[int] = None
    severity_multiplier: Optional[float] = None


# User Overview
class UserOverview(BaseModel):
    user: UserOut
    cameras: List[CameraOut]
    incidents: List[IncidentOut]

    class Config:
        from_attributes = True