"""
backend/app/api/v1/blockchain_verification.py

Admin-only Blockchain Evidence Integrity Verification API.

Endpoints:
  POST /admin/verify-blockchain/{incident_id}
       Recalculate evidence hash and compare with stored value.
       Updates verification_status → Verified or Rejected.

  GET  /admin/blockchain-status/{incident_id}
       Return the current blockchain integrity record for an incident.

  GET  /admin/blockchain-records
       List all blockchain records (with pagination).

  POST /internal/create-blockchain-record
       Internal endpoint for the AI worker to register a new blockchain
       record immediately after evidence is auto-generated.
       (No admin auth required – protected by network boundary only.)
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Security, status, Query
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

from ... import crud, schemas, models
from ...core.config import settings
from ...core.database import get_db
from ...dependencies import get_current_user
from ...services.evidence_integrity import (
    create_blockchain_record,
    verify_blockchain_record,
    get_blockchain_record,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Internal API key scheme  (reuses the AI_WORKER_SERVICE_KEY already in Settings)
# ---------------------------------------------------------------------------
_internal_key_header = APIKeyHeader(name="X-AI-Worker-Secret", auto_error=False)


def _verify_internal_secret(key: Optional[str] = Security(_internal_key_header)) -> None:
    """Dependency: validates the shared secret sent by the AI worker."""
    expected = settings.AI_WORKER_SERVICE_KEY
    if not expected or not key or key != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing internal API secret.",
        )


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _require_admin(current_user: models.User) -> models.User:
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for blockchain verification.",
        )
    return current_user


# ---------------------------------------------------------------------------
# Admin: Verify blockchain integrity for an incident
# ---------------------------------------------------------------------------

@router.post(
    "/verify-blockchain/{incident_id}",
    response_model=schemas.BlockchainVerifyResponse,
    summary="Admin: Verify blockchain integrity of evidence for an incident",
)
def admin_verify_blockchain(
    incident_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Admin workflow:
    1. Retrieve evidence path from blockchain record.
    2. Recalculate SHA-256 hash of the evidence file.
    3. Compare recalculated hash with stored `evidence_hash`.
    4. Update `verification_status` = Verified | Rejected.
    5. Persist admin ID and verification timestamp.
    6. Write immutable AuditLog entry for every verification attempt.
    """
    _require_admin(current_user)

    # Incident must exist
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident {incident_id} not found.",
        )

    result = verify_blockchain_record(db, incident_id=incident_id, admin_id=current_user.id)

    if result["status"] == "error":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result["message"],
        )

    record = get_blockchain_record(db, incident_id)

    # --- Immutable audit log entry for every verification attempt ----------
    try:
        audit_entry = models.AuditLog(
            action="BLOCKCHAIN_VERIFIED",
            evidence_id=None,          # AuditLog.evidence_id is nullable
            user_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            details={
                "incident_id": incident_id,
                "verification_status": result["status"],
                "hash_match": result["match"],
                "evidence_hash": result.get("evidence_hash"),
                "stored_hash": result.get("stored_hash"),
                "blockchain_record_id": record.id if record else None,
            },
        )
        db.add(audit_entry)
        db.commit()
        logger.info(
            "[AuditLog] BLOCKCHAIN_VERIFIED – incident=%d admin=%d status=%s",
            incident_id, current_user.id, result["status"],
        )
    except Exception as audit_err:
        # Audit failure must never break the verification response
        logger.error("[AuditLog] Failed to write audit entry: %s", audit_err)

    return schemas.BlockchainVerifyResponse(
        message=result["message"],
        status=result["status"],   # already a title-case string: Verified | Rejected
        match=result["match"],
        evidence_hash=result.get("evidence_hash"),
        stored_hash=result.get("stored_hash"),
        incident_id=incident_id,
        verified_by_admin=current_user.id,
        verification_date=record.verification_date or datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Admin: Get current blockchain status for an incident
# ---------------------------------------------------------------------------

@router.get(
    "/blockchain-status/{incident_id}",
    response_model=schemas.EvidenceBlockchainOut,
    summary="Get blockchain integrity record for an incident",
)
def get_blockchain_status(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns the current blockchain record for the given incident regardless of
    caller role (admin / security / viewer may all view status).

    If no record exists yet but the incident has evidence, one is created
    automatically (backward-compat for evidence saved before auto-creation
    was introduced).
    """
    record = get_blockchain_record(db, incident_id)
    if not record:
        # ── Auto-create for existing evidence that pre-dates the feature ──
        evidence_item = (
            db.query(models.Evidence)
            .filter(models.Evidence.incident_id == incident_id)
            .order_by(models.Evidence.id.asc())
            .first()
        )
        if evidence_item:
            try:
                record, _msg = create_blockchain_record(
                    db,
                    incident_id=incident_id,
                    evidence_path=evidence_item.file_path,
                )
                logger.info(
                    "[BlockchainAPI] Auto-created blockchain record for incident %d: %s",
                    incident_id, _msg,
                )
            except Exception as _auto_err:
                logger.warning(
                    "[BlockchainAPI] Could not auto-create blockchain record for incident %d: %s",
                    incident_id, _auto_err,
                )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No blockchain integrity record found for incident {incident_id}. "
                   f"A record is created automatically once evidence is generated.",
        )
    return record


# ---------------------------------------------------------------------------
# Admin: List all blockchain records
# ---------------------------------------------------------------------------

@router.get(
    "/blockchain-records",
    response_model=List[schemas.EvidenceBlockchainOut],
    summary="Admin: List all blockchain integrity records",
)
def list_blockchain_records(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List all blockchain records with pagination. Admin only."""
    _require_admin(current_user)
    return crud.get_all_blockchain_records(db, skip=skip, limit=limit)


# ---------------------------------------------------------------------------
# Internal: Create blockchain record (called by AI worker after evidence saved)
# ---------------------------------------------------------------------------

from pydantic import BaseModel as _PydanticBase


class InternalBlockchainCreateRequest(_PydanticBase):
    incident_id: int
    evidence_path: str

@router.post(
    "/internal/create-blockchain-record",
    response_model=schemas.EvidenceBlockchainOut,
    summary="Internal: Register auto-generated evidence in blockchain ledger",
    include_in_schema=False,   # Hidden from public API docs
)
def internal_create_blockchain_record(
    payload: InternalBlockchainCreateRequest,
    db: Session = Depends(get_db),
    _: None = Depends(_verify_internal_secret),
):
    """
    Called internally by the AI worker after evidence is auto-generated.
    No authentication required (protected by network boundary / service mesh).

    Idempotent: if a record already exists for the incident, it is returned.
    """
    # Validate incident exists
    incident = db.query(models.Incident).filter(
        models.Incident.id == payload.incident_id
    ).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident {payload.incident_id} not found.",
        )

    record, message = create_blockchain_record(
        db,
        incident_id=payload.incident_id,
        evidence_path=payload.evidence_path,
    )

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create blockchain record.",
        )

    logger.info(
        "[BlockchainAPI] %s for incident %d", message, payload.incident_id
    )
    return record
