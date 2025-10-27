from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user

router = APIRouter()

@router.post("/", response_model=schemas.EvidenceOut)
def create_evidence(
    evidence: schemas.EvidenceCreate,
    db: Session = Depends(get_db)
    # No auth for AI worker
):
    # Verify incident exists
    incident = crud.get_incident(db, evidence.incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    created_evidence = crud.create_evidence(db, evidence)
    # Optional: Trigger IPFS upload (safe optional import)
    try:
        from ...tasks.notifications import upload_to_ipfs  # Placeholder task
        upload_to_ipfs.delay(created_evidence.id)
    except Exception:
        # If the placeholder task isn't available, skip without failing the request
        pass
    return created_evidence

@router.get("/{incident_id}", response_model=List[schemas.EvidenceOut])
def read_evidence_by_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    incident = crud.get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    # Access check via incident
    if current_user.role != "admin" and incident.camera.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No access")
    evidence_list = db.query(models.Evidence).filter(models.Evidence.incident_id == incident_id).all()
    return [schemas.EvidenceOut.from_orm(e) for e in evidence_list]

@router.get("/{evidence_id}", response_model=schemas.EvidenceOut)
def read_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    evidence = crud.get_evidence(db, evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    # Access via incident
    incident = evidence.incident
    if current_user.role != "admin" and incident.camera.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No access")
    return schemas.EvidenceOut.from_orm(evidence)

# Static serving: Access files at /evidence/{camera_id}/{filename} (mounted in __init__.py)