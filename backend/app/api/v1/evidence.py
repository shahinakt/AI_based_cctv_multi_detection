from fastapi import APIRouter, Depends, HTTPException, status
import json
from sqlalchemy.orm import Session
from typing import List
from pathlib import Path
from datetime import datetime
from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user

router = APIRouter()

# Lazy import to avoid circular dependency
def get_blockchain_service():
    try:
        from ...services.blockchain import blockchain_service
        return blockchain_service
    except ImportError as e:
        print(f"[Blockchain] Service not available: {e}")
        return None
    except Exception as e:
        print(f"[Blockchain] Service error: {e}")
        return None

@router.post("/", response_model=schemas.EvidenceOut)
def create_evidence(
    evidence: schemas.EvidenceCreate,
    db: Session = Depends(get_db)
    # No auth for AI worker
):
    try:
        print(f"[Evidence] Creating evidence for incident {evidence.incident_id}")
        
        # Verify incident exists
        incident = crud.get_incident(db, evidence.incident_id)
        if not incident:
            print(f"[Evidence] ❌ Incident {evidence.incident_id} not found")
            raise HTTPException(status_code=404, detail="Incident not found")
        
        print(f"[Evidence] ✅ Found incident {evidence.incident_id}")
        
        # Create evidence record
        created_evidence = crud.create_evidence(db, evidence)
        print(f"[Evidence] ✅ Evidence record created with ID {created_evidence.id}")
    
    except Exception as e:
        print(f"[Evidence] ❌ Critical error in evidence creation: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Evidence creation failed: {str(e)}")
    
    # Register evidence hash on blockchain and save tx hash (in try-catch to not fail evidence creation)
    try:
        blockchain_service = get_blockchain_service()
        if not blockchain_service:
            print("[Blockchain] Service not available, skipping blockchain registration")
            return created_evidence
            
        # Build correct path to evidence file
        evidence_file_path = created_evidence.file_path
        
        # AI worker saves files to: C:\Users\dell\Desktop\Project\data\captures\camera_0\file.jpg
        # And sends relative path: camera_0/file.jpg
        import os
        project_root = Path(__file__).resolve().parents[3]  # Go to project root
        full_file_path = project_root / "data" / "captures" / evidence_file_path
        
        print(f"[Blockchain] Looking for evidence file: {full_file_path}")
        
        if not full_file_path.exists():
            print(f"[Blockchain] Evidence file not found at: {full_file_path}")
            # Try alternative path structures
            alt_path = Path("C:/Users/dell/Desktop/Project/data/captures") / evidence_file_path
            if alt_path.exists():
                full_file_path = alt_path
                print(f"[Blockchain] Found evidence at alternative path: {full_file_path}")
            else:
                print(f"[Blockchain] Evidence file not found anywhere, skipping blockchain registration")
                return created_evidence
        
        # Compute hash from the file
        sha256_hash = blockchain_service.compute_file_hash(str(full_file_path))
        # Prepare metadata
        metadata = json.dumps({
            "incident_id": created_evidence.incident_id,
            "file_path": created_evidence.file_path,
            "created_at": str(created_evidence.created_at)
        })
        tx_hash = blockchain_service.register_evidence(sha256_hash, metadata)
        if tx_hash:
            created_evidence.blockchain_tx_hash = tx_hash
            created_evidence.blockchain_hash = sha256_hash
            db.commit()
            db.refresh(created_evidence)
            print(f"[Blockchain] Registered evidence on chain: tx={tx_hash}")
        else:
            print(f"[Blockchain] Failed to register evidence on chain")
    except Exception as e:
        print(f"[Blockchain] Error registering evidence: {e}")
        # Don't fail evidence creation if blockchain fails
    
    # Optional: Trigger IPFS upload (safely handle missing imports)
    try:
        from ...tasks.notifications import upload_to_ipfs  
        upload_to_ipfs.delay(created_evidence.id)
        print(f"[IPFS] Upload task queued for evidence {created_evidence.id}")
    except ImportError as e:
        print(f"[IPFS] Upload task not available: {e}")
    except Exception as e:
        print(f"[IPFS] Error starting upload task: {e}")
        
    return created_evidence

@router.get("/my/all", response_model=List[schemas.EvidenceOut])
def get_my_evidence(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get all evidence from incidents related to cameras owned by the current user.
    
    - Admins can see all evidence
    - Users can see evidence from their own cameras only
    - Security role cannot access this endpoint
    """
    # Security role check
    if current_user.role == "security":
        raise HTTPException(
            status_code=403, 
            detail="Security role cannot access evidence directly"
        )
    
    # Get all evidence based on user role
    if current_user.role == "admin":
        # Admin sees all evidence
        evidence_list = db.query(models.Evidence).all()
    else:
        # Users see evidence from their own cameras
        # Join Evidence -> Incident -> Camera to filter by camera owner
        evidence_list = db.query(models.Evidence).join(
            models.Incident, models.Evidence.incident_id == models.Incident.id
        ).join(
            models.Camera, models.Incident.camera_id == models.Camera.id
        ).filter(
            models.Camera.admin_user_id == current_user.id
        ).all()
    
    return [schemas.EvidenceOut.from_orm(e) for e in evidence_list]

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


@router.post("/{evidence_id}/verify", response_model=schemas.EvidenceVerificationResponse)
def verify_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Verify evidence integrity against blockchain.
    
    - Admins can verify any evidence
    - Users can verify evidence from their own cameras only
    - Security role cannot verify evidence
    """
    # Get evidence
    evidence = crud.get_evidence(db, evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    # Get related incident and camera for access control
    incident = evidence.incident
    camera = incident.camera
    
    # Role-based access control
    if current_user.role == "security":
        raise HTTPException(
            status_code=403, 
            detail="Security role cannot verify evidence"
        )
    
    # Users can only verify evidence from their own cameras
    if current_user.role != "admin" and camera.admin_user_id != current_user.id:
        raise HTTPException(
            status_code=403, 
            detail="You can only verify evidence from your own cameras"
        )
    
    # Check if evidence has blockchain transaction hash
    if not evidence.blockchain_tx_hash or not evidence.blockchain_hash:
        raise HTTPException(
            status_code=400, 
            detail="Evidence not registered on blockchain"
        )
    
    # Get full file path
    evidence_base = Path(__file__).resolve().parents[4] / "data" / "captures"
    provided = Path(evidence.file_path)
    # Resolve file path robustly whether relative like "camera_id/file.jpg",
    # prefixed with "data/captures/..." or absolute.
    if provided.is_absolute():
        file_path = provided
    else:
        # If the path already includes data/captures, join from repo root
        if str(provided).replace("\\", "/").startswith("data/captures"):
            file_path = Path(__file__).resolve().parents[4] / provided
        else:
            file_path = evidence_base / provided
    
    if not file_path.exists():
        raise HTTPException(
            status_code=404, 
            detail="Evidence file not found"
        )
    
    # Compute current hash
    try:
        blockchain_service = get_blockchain_service()
        current_hash = blockchain_service.compute_file_hash(str(file_path))
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to compute file hash: {str(e)}"
        )
    
    # Fetch original hash from blockchain
    try:
        blockchain_service = get_blockchain_service()
        blockchain_data = blockchain_service.verify_evidence(evidence.blockchain_hash)
        if not blockchain_data:
            raise HTTPException(
                status_code=500, 
                detail="Could not retrieve evidence from blockchain"
            )
        
        blockchain_hash = blockchain_data["evidenceHash"]
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Blockchain verification failed: {str(e)}"
        )
    
    # Compare hashes
    verification_time = datetime.utcnow()
    
    if current_hash == blockchain_hash:
        status_result = "VERIFIED"
        message = "Evidence integrity verified. File has not been tampered with."
        evidence.verification_status = models.VerificationStatusEnum.VERIFIED
    else:
        status_result = "TAMPERED"
        message = "Evidence integrity check failed. File may have been modified."
        evidence.verification_status = models.VerificationStatusEnum.TAMPERED
    
    # Update database
    evidence.verified_at = verification_time
    db.commit()
    db.refresh(evidence)
    
    return schemas.EvidenceVerificationResponse(
        status=status_result,
        blockchain_hash=blockchain_hash,
        current_hash=current_hash,
        verified_at=verification_time,
        message=message
    )


# Static serving: Access files at /evidence/{camera_id}/{filename} (mounted in __init__.py)