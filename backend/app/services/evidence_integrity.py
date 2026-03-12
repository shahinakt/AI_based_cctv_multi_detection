"""
backend/app/services/evidence_integrity.py

Blockchain-style evidence integrity service.

Responsibilities:
  1. Generate SHA-256 hash of an evidence file (evidence_hash)
  2. Generate blockchain-style hash: SHA-256(evidence_hash + ISO-timestamp)
  3. Create an EvidenceBlockchain record if one does not already exist
  4. Admin verification: recalculate hash and compare to stored value

Path strategy
-------------
The AI worker sends the *absolute* path of the generated snapshot.  We
immediately convert it to a path *relative to EVIDENCE_BASE_DIR* before
storing in the database.  On verification we resolve it back to an absolute
path by joining with EVIDENCE_BASE_DIR.

This means the system survives server migrations and directory moves as long
as the EVIDENCE_DIR environment variable is updated to point at the new
location – no DB records need to change.

This is a pure Python service – no external blockchain node required.
"""
import hashlib
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from .. import models
from ..models import EvidenceBlockchain, BlockchainVerificationStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Evidence base directory
# ---------------------------------------------------------------------------
# Default: ai_worker/data/captures  (same path the __init__.py static mount uses)
# Override via EVIDENCE_DIR env var when deploying to a different location.
EVIDENCE_BASE_DIR: Path = Path(
    os.getenv(
        "EVIDENCE_DIR",
        str(Path(__file__).resolve().parents[3] / "ai_worker" / "data" / "captures"),
    )
)


# ---------------------------------------------------------------------------
# Path helpers  (absolute ↔ relative conversion)
# ---------------------------------------------------------------------------

def _to_relative(path: str) -> str:
    """
    Convert *path* to a string relative to EVIDENCE_BASE_DIR.

    If *path* is already relative it is returned unchanged.
    If *path* is absolute but not under EVIDENCE_BASE_DIR it is stored as-is
    (the original behaviour) with a warning so nothing is silently lost.
    """
    p = Path(path)
    if not p.is_absolute():
        return str(p)   # already relative – nothing to do
    try:
        return str(p.relative_to(EVIDENCE_BASE_DIR))
    except ValueError:
        logger.warning(
            "[BlockchainIntegrity] Evidence path %s is not under EVIDENCE_BASE_DIR %s. "
            "Storing as-is – verification may fail if the server is migrated.",
            path, EVIDENCE_BASE_DIR,
        )
        return str(p)


def _resolve_path(stored_path: str) -> Path:
    """
    Resolve a stored (potentially relative) path to an absolute Path.

    If the stored value is already absolute, return it directly.
    Otherwise join it with EVIDENCE_BASE_DIR.
    """
    p = Path(stored_path)
    if p.is_absolute():
        return p
    return EVIDENCE_BASE_DIR / p


# ---------------------------------------------------------------------------
# Hash helpers
# ---------------------------------------------------------------------------

def _sha256_file(file_path: str) -> str:
    """Return the SHA-256 hex digest of a file's binary contents."""
    h = hashlib.sha256()
    with open(file_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_string(value: str) -> str:
    """Return the SHA-256 hex digest of a UTF-8 string."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def compute_evidence_hash(file_path: str) -> str:
    """
    Compute SHA-256 hash of the evidence file at *file_path*.

    Raises FileNotFoundError if the file does not exist.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Evidence file not found: {file_path}")
    return _sha256_file(str(path))


def compute_blockchain_hash(evidence_hash: str, timestamp: Optional[str] = None) -> str:
    """
    Compute the blockchain-style hash.

    Formula: SHA-256(evidence_hash + timestamp_iso)

    If *timestamp* is not supplied the current UTC ISO timestamp is used.
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc).isoformat()
    return _sha256_string(evidence_hash + timestamp)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_blockchain_record(db: Session, incident_id: int) -> Optional[EvidenceBlockchain]:
    """Return the EvidenceBlockchain record for *incident_id*, or None."""
    return (
        db.query(EvidenceBlockchain)
        .filter(EvidenceBlockchain.incident_id == incident_id)
        .first()
    )


def create_blockchain_record(
    db: Session,
    incident_id: int,
    evidence_path: str,
) -> Tuple[Optional[EvidenceBlockchain], str]:
    """
    Create a blockchain integrity record for a given incident + evidence file.

    Steps:
      1. Check whether a record already exists (idempotency guard).
      2. Convert absolute path → relative (portable across server migrations).
      3. Compute evidence_hash (SHA-256 of file).
      4. Compute blockchain_hash (SHA-256 of evidence_hash + UTC timestamp).
      5. Insert the record with status = Pending.

    Returns (record, message).
    """
    # --- Idempotency check -----------------------------------------------
    existing = get_blockchain_record(db, incident_id)
    if existing:
        logger.info(
            "[BlockchainIntegrity] Record already exists for incident %d – "
            "skipping creation.",
            incident_id,
        )
        return existing, "Blockchain record already exists"

    # --- Path normalisation: store relative path for portability -----------
    relative_path = _to_relative(evidence_path)
    absolute_path = _resolve_path(relative_path)

    # --- File availability check -----------------------------------------
    if not absolute_path.exists():
        logger.warning(
            "[BlockchainIntegrity] Evidence file not found at %s – "
            "creating placeholder record.",
            absolute_path,
        )
        evidence_hash = _sha256_string(f"placeholder:{incident_id}:{relative_path}")
    else:
        evidence_hash = compute_evidence_hash(str(absolute_path))

    # --- Hash generation --------------------------------------------------
    created_at_iso = datetime.now(timezone.utc).isoformat()
    blockchain_hash = compute_blockchain_hash(evidence_hash, timestamp=created_at_iso)

    # --- Insert record (relative path stored) ----------------------------
    record = EvidenceBlockchain(
        incident_id=incident_id,
        evidence_path=relative_path,    # ← relative, not absolute
        evidence_hash=evidence_hash,
        blockchain_hash=blockchain_hash,
        verification_status=BlockchainVerificationStatus.Pending,
        verified_by_admin=None,
        verification_date=None,
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
        logger.info(
            "[BlockchainIntegrity] ✅ Blockchain record created for incident %d "
            "(evidence_hash=%s…, path=%s)",
            incident_id, evidence_hash[:16], relative_path,
        )
        return record, "Blockchain record created successfully"
    except IntegrityError:
        db.rollback()
        existing = get_blockchain_record(db, incident_id)
        logger.info(
            "[BlockchainIntegrity] Race condition – returning existing record "
            "for incident %d.",
            incident_id,
        )
        return existing, "Blockchain record already exists (race condition resolved)"


def verify_blockchain_record(
    db: Session,
    incident_id: int,
    admin_id: int,
) -> dict:
    """
    Admin verification workflow:

    1. Retrieve the stored blockchain record.
    2. Resolve the stored (relative) path to an absolute path.
    3. Re-compute SHA-256 of the evidence file.
    4. Compare with stored evidence_hash.
    5. Update verification_status → Verified or Rejected.
    6. Persist admin_id and verification_date.

    Returns a dict with keys: status, message, evidence_hash, stored_hash, match.
    Note: AuditLog is written by the API layer (blockchain_verification.py) so
    that the HTTP request context (IP, user-agent) can be included.
    """
    record = get_blockchain_record(db, incident_id)
    if not record:
        return {
            "status": "error",
            "message": "No blockchain record found for this incident.",
            "match": False,
        }

    # --- Resolve stored path (may be relative or legacy absolute) ---------
    absolute_path = _resolve_path(record.evidence_path)

    if not absolute_path.exists():
        logger.warning(
            "[BlockchainIntegrity] Evidence file missing at %s during verification.",
            absolute_path,
        )
        record.verification_status = BlockchainVerificationStatus.Rejected
        record.verified_by_admin = admin_id
        record.verification_date = datetime.now(timezone.utc)
        db.commit()
        return {
            "status": "Rejected",
            "message": f"Evidence file not found at '{absolute_path}' – integrity cannot be confirmed.",
            "match": False,
            "evidence_hash": record.evidence_hash,
            "stored_hash": record.evidence_hash,
        }

    recalculated_hash = compute_evidence_hash(str(absolute_path))
    stored_hash = record.evidence_hash
    hashes_match = recalculated_hash == stored_hash

    # --- Update record ----------------------------------------------------
    record.verification_status = (
        BlockchainVerificationStatus.Verified
        if hashes_match
        else BlockchainVerificationStatus.Rejected
    )
    record.verified_by_admin = admin_id
    record.verification_date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    logger.info(
        "[BlockchainIntegrity] Verification for incident %d: %s (admin=%d)",
        incident_id,
        record.verification_status.value,
        admin_id,
    )

    return {
        "status": record.verification_status.value,
        "message": (
            "Evidence integrity verified – hashes match."
            if hashes_match
            else "Evidence tampered – hashes do not match."
        ),
        "match": hashes_match,
        "evidence_hash": recalculated_hash,
        "stored_hash": stored_hash,
    }
