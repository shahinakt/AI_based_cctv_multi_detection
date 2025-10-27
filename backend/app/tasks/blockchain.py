import hashlib
from .celery_app import celery_app
from sqlalchemy.orm import Session
from ..core.database import SessionLocal
from .. import crud, models
import os

@celery_app.task(bind=True, max_retries=3, queue="blockchain")
def register_blockchain_evidence(self, incident_id: int):
    db = SessionLocal()
    try:
        incident = crud.get_incident(db, incident_id)
        if not incident:
            return {"status": "Incident not found"}

        # Get evidence (assume first for simplicity; loop in prod)
        evidence = incident.evidence_items[0] if incident.evidence_items else None
        if not evidence:
            return {"status": "No evidence"}

        # Compute SHA256 if not present
        if not evidence.sha256_hash:
            file_path = os.path.join("../data/captures", evidence.file_path)
            if os.path.exists(file_path):
                sha256_hash = hashlib.sha256(open(file_path, "rb").read()).hexdigest()
                evidence.sha256_hash = sha256_hash
                db.commit()
            else:
                raise ValueError("Evidence file not found")

        # Register on blockchain (placeholder call)
        try:
            # Import here to avoid import-time errors when the top-level `blockchain`
            # package (located at repository root) isn't on sys.path during app import.
            from blockchain.register_evidence import register_evidence
        except Exception as exc:
            # If import fails, log and re-raise so the task can retry or fail gracefully
            print(f"Failed to import blockchain.register_evidence: {exc}")
            raise
        tx_hash = register_evidence(incident_id, evidence.sha256_hash)

        # Update DB
        incident.blockchain_tx = tx_hash
        db.commit()

        # Optional: Trigger IPFS upload
        # upload_to_ipfs.delay(evidence.id)

        return {"status": "success", "tx_hash": tx_hash}
    except Exception as exc:
        print(f"Blockchain task failed: {exc}")
        try:
            self.retry(exc=exc, countdown=60 * (self.request.retries + 1))  # Exponential backoff
        except self.max_retries:
            print("Max retries exceeded")
        finally:
            db.close()