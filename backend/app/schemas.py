from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict, Any
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
    password: str = Field(..., min_length=8)

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

class UserInDB(UserOut):
    hashed_password: str

# Camera schemas
class CameraBase(BaseModel):
    name: str = Field(..., max_length=100)
    rtsp_url: str
    location: Optional[str] = None

class CameraCreate(CameraBase):
    admin_user_id: int

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None

class CameraOut(CameraBase):
    id: int
    admin_user_id: int
    sensitivity_settings_id: Optional[int] = None
    is_active: bool
    created_at: datetime

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

# Pagination (generic)
class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    skip: int
    limit: int