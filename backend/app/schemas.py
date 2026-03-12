"""
backend/app/schemas.py
Added CameraStatus, Blockchain, and SOS schemas
"""
import re
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
    full_name: Optional[str] = None
    phone: Optional[str] = None

    @validator("full_name")
    def validate_full_name(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not re.match(r'^[A-Za-z ]+$', v):
            raise ValueError("Name must contain only letters.")
        if len(v) < 2 or len(v) > 50:
            raise ValueError("Name must be between 2 and 50 characters.")
        return v

    @validator("phone")
    def validate_phone(cls, v):
        if v is None:
            return v
        if not re.match(r'^[0-9]{10}$', v):
            raise ValueError("Phone number must contain exactly 10 digits.")
        return v


class UserCreate(UserBase):
    password: Annotated[str, Field(min_length=8, max_length=72)]
    role: RoleEnum = RoleEnum.viewer


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    role: Optional[RoleEnum] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact_1: Optional[str] = None
    emergency_contact_2: Optional[str] = None

    @validator("role")
    def validate_role(cls, v):
        if v and v not in [r.value for r in ModelRoleEnum]:
            raise ValueError("Invalid role")
        return v

    @validator("full_name")
    def validate_full_name(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not re.match(r'^[A-Za-z ]+$', v):
            raise ValueError("Name must contain only letters.")
        if len(v) < 2 or len(v) > 50:
            raise ValueError("Name must be between 2 and 50 characters.")
        return v

    @validator("phone")
    def validate_phone(cls, v):
        if v is None:
            return v
        if not re.match(r'^[0-9]{10}$', v):
            raise ValueError("Phone number must contain exactly 10 digits.")
        return v


class UserOut(UserBase):
    id: int
    role: RoleEnum
    is_active: bool
    full_name: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact_1: Optional[str] = None
    emergency_contact_2: Optional[str] = None
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
        description="RTSP/HTTP URL, webcam index (0,1,2), or 'manual' for reports"
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
        # Allow "manual" for user-reported incidents
        if v.lower() == "manual":
            return v
        raise ValueError("stream_url must be webcam index, RTSP/HTTP URL, or 'manual'")


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
        # Allow "manual" for user-reported incidents
        if v.lower() == "manual":
            return v
        raise ValueError("stream_url must be webcam index, RTSP/HTTP URL, or 'manual'")


class CameraOut(CameraBase):
    id: int
    admin_user_id: Optional[int] = None
    sensitivity_settings_id: Optional[int] = None
    is_active: Optional[bool] = None
    created_at: datetime

    # Nested relationship for camera owner
    admin_user: Optional['UserOut'] = None

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
    status: str  # 'starting', 'running', 'stopped', 'error', 'inactive'
    error_message: Optional[str] = None

    # Give defaults so Pydantic doesn't blow up if DB has NULL
    fps: float = 0.0
    last_frame_time: Optional[datetime] = None
    total_frames: int = 0
    total_incidents: int = 0

    processing_device: Optional[str] = None
    started_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class CameraStatusUpdate(BaseModel):
    """For AI worker to update camera status"""
    # Make status optional so partial updates are allowed
    status: Optional[str] = None
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

    # SOS fields (new – nullable so old records without the column still deserialise)
    incident_status: Optional[str] = "Pending"
    sos_triggered: Optional[bool] = False
    acknowledged_at: Optional[datetime] = None

    # Nested relationships for display
    camera: Optional['CameraOut'] = None
    assigned_user: Optional['UserOut'] = None
    # Include related evidence; use default_factory to avoid mutable default issues
    evidence_items: List['EvidenceOut'] = []

    class Config:
        from_attributes = True


# Evidence schemas
class EvidenceBase(BaseModel):
    incident_id: int
    file_path: str
    sha256_hash: str
    file_type: str
    extra_metadata: Optional[Dict[str, Any]] = None


class EvidenceCreate(EvidenceBase):
    blockchain_tx_hash: Optional[str] = None
    blockchain_hash: Optional[str] = None


class EvidenceOut(EvidenceBase):
    id: int
    uploaded_to_ipfs: bool = False
    created_at: datetime
    blockchain_tx_hash: Optional[str] = None
    blockchain_hash: Optional[str] = None
    verification_status: str = "PENDING"
    verified_at: Optional[datetime] = None

    @validator('uploaded_to_ipfs', pre=True)
    def handle_none_uploaded_to_ipfs(cls, v):
        return v if v is not None else False

    class Config:
        from_attributes = True


class EvidenceVerificationResponse(BaseModel):
    """Response schema for evidence verification"""
    status: str  # "VERIFIED" or "TAMPERED"
    blockchain_hash: str
    current_hash: str
    verified_at: datetime
    message: str


# ===================================================================
# ULTRA PROTECTION SCHEMAS - Evidence Security
# ===================================================================

class EvidenceShareCreate(BaseModel):
    """Create evidence share for security role"""
    evidence_id: int
    shared_with_user_id: int


class EvidenceShareOut(BaseModel):
    """Evidence share output"""
    id: int
    evidence_id: int
    shared_with_user_id: int
    shared_by_admin_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogOut(BaseModel):
    """Audit log output - read-only"""
    id: int
    action: str
    evidence_id: Optional[int]
    user_id: int
    ip_address: Optional[str]
    user_agent: Optional[str]
    details: Optional[Dict[str, Any]]
    timestamp: datetime
    
    class Config:
        from_attributes = True


class EvidenceVerificationResponseEnhanced(BaseModel):
    """Enhanced verification response with audit trail"""
    status: str  # "VERIFIED", "TAMPERED", or "FILE_MISSING"
    blockchain_hash: str
    current_hash: Optional[str]  # Null if file missing
    verified_at: datetime
    message: str
    file_exists: bool
    audit_log_id: int  # Reference to audit log entry


class EvidenceWithAccessControl(EvidenceOut):
    """Evidence with access metadata"""
    can_verify: bool
    can_share: bool
    is_shared_with_me: bool = False
    tamper_status: str  # "VERIFIED", "TAMPERED", "PENDING", "FILE_MISSING"


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

# Update forward references to resolve nested relationships
IncidentOut.model_rebuild()
CameraOut.model_rebuild()
UserOut.model_rebuild()
EvidenceOut.model_rebuild()


# ===================================================================
# Evidence Blockchain Integrity schemas
# ===================================================================

class BlockchainVerificationStatus(str, Enum):
    Pending = "Pending"
    Verified = "Verified"
    Rejected = "Rejected"


class EvidenceBlockchainOut(BaseModel):
    id: int
    incident_id: int
    evidence_path: str
    evidence_hash: str
    blockchain_hash: str
    verification_status: BlockchainVerificationStatus
    verified_by_admin: Optional[int] = None
    verification_date: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BlockchainVerifyResponse(BaseModel):
    success: bool = True
    message: str
    status: str            # title-case value from service: Pending | Verified | Rejected
    match: bool
    evidence_hash: Optional[str] = None
    stored_hash: Optional[str] = None
    incident_id: int
    verified_by_admin: int
    verification_date: datetime


# ===================================================================
# SOS Alert schemas
# ===================================================================

class IncidentStatusEnum(str, Enum):
    Pending = "Pending"
    Acknowledged = "Acknowledged"
    SosTriggered = "SosTriggered"
    Resolved = "Resolved"


class SosAlertOut(BaseModel):
    id: int
    incident_id: int
    alert_status: str          # active | handled
    alert_message: Optional[str] = None
    triggered_at: datetime
    handled_by_admin: Optional[int] = None
    handled_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AcknowledgeResponse(BaseModel):
    """Response from POST /incidents/acknowledge/{incident_id}"""
    success: bool
    message: str
    incident_id: int
    incident_status: str
    sos_cancelled: bool          # True if a pending SOS timer was cancelled
    acknowledged_at: datetime


class SosHandleRequest(BaseModel):
    """Body for PATCH /sos/{sos_id}/handle (admin marks SOS as handled)"""
    resolution_note: Optional[str] = None


class SosStatusResponse(BaseModel):
    """Lightweight SOS status check for a single incident"""
    incident_id: int
    sos_triggered: bool
    sos_alert: Optional[SosAlertOut] = None
    incident_status: str
    acknowledged: bool
    time_remaining_seconds: Optional[int] = None  # populated by timer service
