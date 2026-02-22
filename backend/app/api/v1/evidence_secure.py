"""
ULTRA PROTECTION Evidence API - Security-First Architecture
=============================================================

This module implements:
- Strict role-based access control (RBAC)
- Blockchain verification with tamper detection
- Immutable audit trail
- Admin-Security evidence sharing system
- File integrity validation
- Legal-grade evidence management

NO DELETE OR UPDATE ENDPOINTS - Evidence is immutable once created.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional, Dict, Any
from pathlib import Path
from datetime import datetime, timezone
from pydantic import BaseModel
import hashlib
import os

from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user

router = APIRouter()

# ===================================================================
# LOCAL SCHEMA DEFINITIONS (For ULTRA PROTECTION Features)
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
    audit_log_id: int


class EvidenceWithAccessControl(schemas.EvidenceOut):
    """Evidence with access metadata"""
    can_verify: bool
    can_share: bool
    is_shared_with_me: bool = False
    tamper_status: str  # "VERIFIED", "TAMPERED", "PENDING", "FILE_MISSING"


# ===================================================================
# AUDIT LOGGING SYSTEM
# ===================================================================

def create_audit_log(
    db: Session,
    action: str,
    evidence_id: Optional[int],
    user_id: int,
    ip_address: Optional[str],
    user_agent: Optional[str],
    details: Optional[dict] = None
) -> models.AuditLog:
    """
    Create immutable audit log entry.
    
    Actions:
    - EVIDENCE_CREATED
    - EVIDENCE_VERIFIED
    - EVIDENCE_SHARED
    - EVIDENCE_ACCESSED
    - EVIDENCE_TAMPER_DETECTED
    """
    audit = models.AuditLog(
        action=action,
        evidence_id=evidence_id,
        user_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details,
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit


# ===================================================================
# ROLE-BASED ACCESS CONTROL HELPERS
# ===================================================================

def check_evidence_access(
    evidence: models.Evidence,
    current_user: models.User,
    db: Session
) -> tuple[bool, str]:
    """
    Check if user can access evidence based on role.
    
    Returns: (can_access: bool, reason: str)
    
    Rules:
    - ADMIN: Full access to all evidence
    - VIEWER: Only evidence from own cameras
    - SECURITY: Only explicitly shared evidence
    """
    if current_user.role == models.RoleEnum.admin:
        return True, "Admin has full access"
    
    # Get related incident and camera
    incident = evidence.incident
    if not incident:
        return False, "Evidence has no associated incident"
    
    camera = incident.camera
    if not camera:
        return False, "Incident has no associated camera"
    
    if current_user.role == models.RoleEnum.viewer:
        # Viewers can only access evidence from their own cameras
        if camera.admin_user_id == current_user.id:
            return True, "Viewer owns camera"
        return False, "Evidence not from your camera"
    
    if current_user.role == models.RoleEnum.security:
        # Security must have explicit share permission
        share = db.query(models.EvidenceShare).filter(
            and_(
                models.EvidenceShare.evidence_id == evidence.id,
                models.EvidenceShare.shared_with_user_id == current_user.id
            )
        ).first()
        
        if share:
            return True, "Evidence shared with you"
        return False, "Evidence not shared with security role"
    
    return False, "Unknown role or access denied"


def can_verify_evidence(current_user: models.User) -> bool:
    """Only admin can verify evidence"""
    return current_user.role == models.RoleEnum.admin


def can_share_evidence(current_user: models.User) -> bool:
    """Only admin can share evidence"""
    return current_user.role == models.RoleEnum.admin


# ===================================================================
# FILE INTEGRITY & BLOCKCHAIN VERIFICATION
# ===================================================================

def calculate_file_hash(file_path: Path) -> Optional[str]:
    """Calculate SHA256 hash of file"""
    if not file_path.exists():
        return None
    
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def resolve_evidence_path(file_path: str) -> Path:
    """Resolve evidence file path from database"""
    evidence_base = Path(__file__).resolve().parents[4] / "ai_worker" / "data" / "captures"
    provided = Path(file_path)
    
    if provided.is_absolute():
        return provided
    else:
        if str(provided).replace("\\", "/").startswith("data/captures"):
            repo_root = Path(__file__).resolve().parents[4]
            return repo_root / provided
        elif str(provided).replace("\\", "/").startswith("captures/"):
            return evidence_base.parent / provided
        else:
            return evidence_base / provided


# ===================================================================
# API ENDPOINTS
# ===================================================================

@router.get("/")
def get_all_evidence_with_rbac(
    request: Request,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get evidence with role-based filtering.
    
    - ADMIN: All evidence
    - VIEWER: Only evidence from own cameras
    - SECURITY: Only shared evidence
    
    Returns evidence with access control metadata.
    """
    # Log access
    create_audit_log(
        db=db,
        action="EVIDENCE_ACCESSED",
        evidence_id=None,
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"list_access": True, "role": current_user.role.value}
    )
    
    # Role-based query filtering
    if current_user.role == models.RoleEnum.admin:
        # Admin sees all evidence
        evidence_items = db.query(models.Evidence).offset(skip).limit(limit).all()
    
    elif current_user.role == models.RoleEnum.viewer:
        # Viewer sees only evidence from own cameras
        evidence_items = db.query(models.Evidence).join(
            models.Incident, models.Evidence.incident_id == models.Incident.id
        ).join(
            models.Camera, models.Incident.camera_id == models.Camera.id
        ).filter(
            models.Camera.admin_user_id == current_user.id
        ).offset(skip).limit(limit).all()
    
    elif current_user.role == models.RoleEnum.security:
        # Security sees only shared evidence
        shared_evidence_ids = db.query(models.EvidenceShare.evidence_id).filter(
            models.EvidenceShare.shared_with_user_id == current_user.id
        ).all()
        shared_ids = [e[0] for e in shared_evidence_ids]
        
        if not shared_ids:
            return []  # No shared evidence
        
        evidence_items = db.query(models.Evidence).filter(
            models.Evidence.id.in_(shared_ids)
        ).offset(skip).limit(limit).all()
    
    else:
        raise HTTPException(status_code=403, detail="Unknown role")
    
    # Add access control metadata
    result = []
    for evidence in evidence_items:
        ev_dict = {
            "id": evidence.id,
            "incident_id": evidence.incident_id,
            "file_path": evidence.file_path,
            "sha256_hash": evidence.sha256_hash,
            "file_type": evidence.file_type,
            "extra_metadata": evidence.extra_metadata,
            "uploaded_to_ipfs": evidence.uploaded_to_ipfs,
            "created_at": evidence.created_at,
            "blockchain_tx_hash": evidence.blockchain_tx_hash,
            "blockchain_hash": evidence.blockchain_hash,
            "verification_status": evidence.verification_status.value,
            "verified_at": evidence.verified_at,
            # Access control metadata
            "can_verify": can_verify_evidence(current_user),
            "can_share": can_share_evidence(current_user),
            "is_shared_with_me": current_user.role == models.RoleEnum.security,
            "tamper_status": evidence.verification_status.value
        }
        result.append(EvidenceWithAccessControl(**ev_dict))
    
    return result


@router.get("/{evidence_id}")
def get_evidence_by_id(
    request: Request,
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get single evidence with access control check.
    Returns 403 if user doesn't have access permission.
    """
    evidence = db.query(models.Evidence).filter(models.Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    # Check access permission
    can_access, reason = check_evidence_access(evidence, current_user, db)
    if not can_access:
        # Log unauthorized access attempt
        create_audit_log(
            db=db,
            action="EVIDENCE_ACCESS_DENIED",
            evidence_id=evidence_id,
            user_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            details={"reason": reason, "role": current_user.role.value}
        )
        raise HTTPException(status_code=403, detail=f"Access denied: {reason}")
    
    # Log successful access
    create_audit_log(
        db=db,
        action="EVIDENCE_ACCESSED",
        evidence_id=evidence_id,
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"reason": reason}
    )
    
    # Return with access metadata
    ev_dict = {
        "id": evidence.id,
        "incident_id": evidence.incident_id,
        "file_path": evidence.file_path,
        "sha256_hash": evidence.sha256_hash,
        "file_type": evidence.file_type,
        "extra_metadata": evidence.extra_metadata,
        "uploaded_to_ipfs": evidence.uploaded_to_ipfs,
        "created_at": evidence.created_at,
        "blockchain_tx_hash": evidence.blockchain_tx_hash,
        "blockchain_hash": evidence.blockchain_hash,
        "verification_status": evidence.verification_status.value,
        "verified_at": evidence.verified_at,
        "can_verify": can_verify_evidence(current_user),
        "can_share": can_share_evidence(current_user),
        "is_shared_with_me": current_user.role == models.RoleEnum.security,
        "tamper_status": evidence.verification_status.value
    }
    
    return EvidenceWithAccessControl(**ev_dict)


@router.post("/{evidence_id}/verify")
def verify_evidence_ultra_secure(
    request: Request,
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    ADMIN-ONLY: Verify evidence integrity against blockchain.
    
    Process:
    1. Check admin permission
    2. Validate file exists
    3. Recalculate SHA256 hash
    4. Compare with blockchain_hash
    5. Update verification_status
    6. Create audit log entry
    
    Returns:
    - VERIFIED: Hashes match
    - TAMPERED: Hashes don't match
    - FILE_MISSING: File not found on disk
    """
    # STRICT: Only admin can verify
    if current_user.role != models.RoleEnum.admin:
        create_audit_log(
            db=db,
            action="VERIFICATION_DENIED",
            evidence_id=evidence_id,
            user_id=current_user.id,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None,
            details={"reason": "Non-admin role attempted verification", "role": current_user.role.value}
        )
        raise HTTPException(
            status_code=403,
            detail="Only admin can verify evidence"
        )
    
    # Get evidence
    evidence = db.query(models.Evidence).filter(models.Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    # Check blockchain registration
    if not evidence.blockchain_hash:
        raise HTTPException(
            status_code=400,
            detail="Evidence not registered on blockchain"
        )
    
    # Resolve file path
    file_path = resolve_evidence_path(evidence.file_path)
    
    # Check file existence
    if not file_path.exists():
        # File missing - automatic tamper detection
        evidence.verification_status = models.VerificationStatusEnum.TAMPERED
        evidence.verified_at = datetime.now(timezone.utc)
        db.commit()
        
        # Create audit log
        audit = create_audit_log(
            db=db,
            action="EVIDENCE_TAMPER_DETECTED",
            evidence_id=evidence_id,
            user_id=current_user.id,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None,
            details={
                "reason": "FILE_MISSING",
                "expected_path": str(file_path),
                "blockchain_hash": evidence.blockchain_hash
            }
        )
        
        return EvidenceVerificationResponseEnhanced(
            status="FILE_MISSING",
            blockchain_hash=evidence.blockchain_hash,
            current_hash=None,
            verified_at=evidence.verified_at,
            message="⚠️ CRITICAL: Evidence file not found on disk. Potential data loss or tampering.",
            file_exists=False,
            audit_log_id=audit.id
        )
    
    # Calculate current file hash
    current_hash = calculate_file_hash(file_path)
    
    if not current_hash:
        raise HTTPException(
            status_code=500,
            detail="Failed to calculate file hash"
        )
    
    # Compare hashes
    if current_hash == evidence.blockchain_hash:
        # VERIFIED
        evidence.verification_status = models.VerificationStatusEnum.VERIFIED
        evidence.verified_at = datetime.now(timezone.utc)
        db.commit()
        
        audit = create_audit_log(
            db=db,
            action="EVIDENCE_VERIFIED",
            evidence_id=evidence_id,
            user_id=current_user.id,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None,
            details={
                "status": "VERIFIED",
                "blockchain_hash": evidence.blockchain_hash,
                "current_hash": current_hash,
                "file_path": str(file_path)
            }
        )
        
        return EvidenceVerificationResponseEnhanced(
            status="VERIFIED",
            blockchain_hash=evidence.blockchain_hash,
            current_hash=current_hash,
            verified_at=evidence.verified_at,
            message="✅ Evidence integrity verified. Hash matches blockchain record.",
            file_exists=True,
            audit_log_id=audit.id
        )
    
    else:
        # TAMPERED
        evidence.verification_status = models.VerificationStatusEnum.TAMPERED
        evidence.verified_at = datetime.now(timezone.utc)
        db.commit()
        
        audit = create_audit_log(
            db=db,
            action="EVIDENCE_TAMPER_DETECTED",
            evidence_id=evidence_id,
            user_id=current_user.id,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None,
            details={
                "status": "TAMPERED",
                "blockchain_hash": evidence.blockchain_hash,
                "current_hash": current_hash,
                "file_path": str(file_path)
            }
        )
        
        return EvidenceVerificationResponseEnhanced(
            status="TAMPERED",
            blockchain_hash=evidence.blockchain_hash,
            current_hash=current_hash,
            verified_at=evidence.verified_at,
            message="🚨 ALERT: Evidence has been tampered with! Hash mismatch detected.",
            file_exists=True,
            audit_log_id=audit.id
        )


@router.post("/share")
def share_evidence_with_security(
    request: Request,
    share_request: EvidenceShareCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    ADMIN-ONLY: Share evidence with security role.
    
    This is the ONLY way security role can access evidence.
    """
    # Only admin can share
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(
            status_code=403,
            detail="Only admin can share evidence"
        )
    
    # Validate evidence exists
    evidence = db.query(models.Evidence).filter(
        models.Evidence.id == share_request.evidence_id
    ).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    # Validate target user exists and is security role
    target_user = db.query(models.User).filter(
        models.User.id == share_request.shared_with_user_id
    ).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")
    
    if target_user.role != models.RoleEnum.security:
        raise HTTPException(
            status_code=400,
            detail="Can only share with security role"
        )
    
    # Check if already shared
    existing = db.query(models.EvidenceShare).filter(
        and_(
            models.EvidenceShare.evidence_id == share_request.evidence_id,
            models.EvidenceShare.shared_with_user_id == share_request.shared_with_user_id
        )
    ).first()
    
    if existing:
        return existing  # Already shared
    
    # Create share
    share = models.EvidenceShare(
        evidence_id=share_request.evidence_id,
        shared_with_user_id=share_request.shared_with_user_id,
        shared_by_admin_id=current_user.id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    
    # Create audit log
    create_audit_log(
        db=db,
        action="EVIDENCE_SHARED",
        evidence_id=share_request.evidence_id,
        user_id=current_user.id,
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        details={
            "shared_with_user_id": share_request.shared_with_user_id,
            "shared_with_username": target_user.username
        }
    )
    
    return share


@router.get("/audit/{evidence_id}")
def get_evidence_audit_trail(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    ADMIN-ONLY: Get complete audit trail for evidence.
    Shows all access, verification, and sharing events.
    """
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(
            status_code=403,
            detail="Only admin can view audit logs"
        )
    
    # Get evidence to verify it exists
    evidence = db.query(models.Evidence).filter(models.Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    # Get all audit logs for this evidence
    audit_logs = db.query(models.AuditLog).filter(
        models.AuditLog.evidence_id == evidence_id
    ).order_by(models.AuditLog.timestamp.desc()).all()
    
    return audit_logs


@router.get("/stats/summary")
def get_evidence_security_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get evidence security statistics (admin only).
    
    Returns:
    - Total evidence count
    - Verification status breakdown
    - Tampered evidence count
    - Recent audit activity
    """
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    total = db.query(models.Evidence).count()
    verified = db.query(models.Evidence).filter(
        models.Evidence.verification_status == models.VerificationStatusEnum.VERIFIED
    ).count()
    tampered = db.query(models.Evidence).filter(
        models.Evidence.verification_status == models.VerificationStatusEnum.TAMPERED
    ).count()
    pending = db.query(models.Evidence).filter(
        models.Evidence.verification_status == models.VerificationStatusEnum.PENDING
    ).count()
    
    recent_audits = db.query(models.AuditLog).order_by(
        models.AuditLog.timestamp.desc()
    ).limit(10).all()
    
    return {
        "total_evidence": total,
        "verified": verified,
        "tampered": tampered,
        "pending": pending,
        "recent_audit_actions": [
            {
                "action": log.action,
                "evidence_id": log.evidence_id,
                "timestamp": log.timestamp.isoformat(),
                "user_id": log.user_id
            }
            for log in recent_audits
        ]
    }
