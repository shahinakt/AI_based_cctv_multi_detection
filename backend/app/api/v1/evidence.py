from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
import json
import os
import hashlib
import shutil
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone
from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user
from ...services.evidence_integrity import create_blockchain_record as _create_bc_record

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

@router.post("/debug/cleanup-broken-paths")
def cleanup_broken_evidence_paths(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Clean up evidence records with incorrect path structure.
    
    Removes evidence with:
    - incident_{id}/ paths (incorrect structure)
    - Paths that don't start with camera_
    
    Admin only.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Find broken evidence
    all_evidence = db.query(models.Evidence).all()
    broken_evidence = []
    
    for e in all_evidence:
        # Check if path follows correct structure
        if not e.file_path.startswith("camera_"):
            broken_evidence.append(e)
    
    deleted_count = 0
    deleted_ids = []
    
    for e in broken_evidence:
        deleted_ids.append(e.id)
        db.delete(e)
        deleted_count += 1
    
    db.commit()
    
    return {
        "status": "success",
        "deleted_count": deleted_count,
        "deleted_evidence_ids": deleted_ids,
        "message": f"Removed {deleted_count} evidence records with incorrect path structure"
    }


@router.get("/debug/stats")
def get_evidence_stats(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Debug endpoint to check evidence database statistics
    """
    total_evidence = db.query(models.Evidence).count()
    total_incidents = db.query(models.Incident).count()
    total_cameras = db.query(models.Camera).count()
    
    user_cameras_count = db.query(models.Camera).filter(
        models.Camera.admin_user_id == current_user.id
    ).count()
    
    # Get sample recent incidents with their camera info
    recent_incidents = db.query(models.Incident).order_by(
        models.Incident.timestamp.desc()
    ).limit(5).all()
    
    incident_samples = []
    for inc in recent_incidents:
        camera = inc.camera
        evidence_count = db.query(models.Evidence).filter(
            models.Evidence.incident_id == inc.id
        ).count()
        
        incident_samples.append({
            "incident_id": inc.id,
            "camera_id": inc.camera_id,
            "camera_owner_id": camera.admin_user_id if camera else None,
            "camera_owner_name": camera.admin_user.username if camera and camera.admin_user else None,
            "evidence_count": evidence_count,
            "timestamp": str(inc.timestamp)
        })
    
    stats = {
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "role": str(current_user.role),
            "cameras_owned": user_cameras_count
        },
        "database": {
            "total_evidence": total_evidence,
            "total_incidents": total_incidents,
            "total_cameras": total_cameras
        },
        "recent_incidents": incident_samples
    }
    
    if user_cameras_count > 0:
        # Support both ownership fields (admin_user_id and legacy user_id)
        user_cameras = db.query(models.Camera).filter(
            or_(
                models.Camera.admin_user_id == current_user.id,
                models.Camera.user_id == current_user.id
            )
        ).all()
        camera_ids = [c.id for c in user_cameras]
        
        user_incidents = db.query(models.Incident).filter(
            models.Incident.camera_id.in_(camera_ids)
        ).count()
        
        user_evidence = db.query(models.Evidence).join(
            models.Incident
        ).filter(
            models.Incident.camera_id.in_(camera_ids)
        ).count()
        
        stats["user"]["incidents_from_cameras"] = user_incidents
        stats["user"]["evidence_from_cameras"] = user_evidence
        stats["user"]["camera_ids"] = camera_ids
    
    return stats

@router.post("/upload", response_model=schemas.EvidenceOut)
async def upload_evidence(
    incident_id: int = Form(...),
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db)
    # No auth required - for AI worker and test scripts
):
    """
    Upload evidence file for an incident.
    
    ✅ CORRECT IMPLEMENTATION:
    - Uses camera_{id}/ folder structure (NOT incident_{id}/)
    - Saves file physically to ai_worker/data/captures/camera_{id}/
    - Stores relative path in DB: "camera_{id}/filename.jpg"
    - Compatible with static file serving at /evidence/
    
    Example:
    - Physical path: ai_worker/data/captures/camera_1/theft_123.jpg
    - DB path: camera_1/theft_123.jpg
    - URL: http://localhost:8000/evidence/camera_1/theft_123.jpg
    """
    try:
        print(f"[Evidence Upload] Processing upload for incident {incident_id}")
        
        # Verify incident exists and get camera_id
        incident = crud.get_incident(db, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        camera_id = incident.camera_id
        print(f"[Evidence Upload] Incident {incident_id} belongs to camera {camera_id}")
        
        # ✅ CRITICAL: Use camera_{id} structure, NOT incident_{id}
        evidence_base = Path(__file__).resolve().parents[4] / "ai_worker" / "data" / "captures"
        camera_dir = evidence_base / f"camera_{camera_id}"
        camera_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        # Generate unique ID to avoid collisions
        import uuid
        unique_id = str(uuid.uuid4()).replace('-', '')[:32]
        
        # Get file extension
        file_ext = Path(file.filename).suffix if file.filename else ".jpg"
        if not file_ext:
            file_ext = ".jpg"
        
        # Create filename: snapshot_{timestamp}_{unique_id}.jpg
        filename = f"snapshot_{timestamp_str}_{unique_id}{file_ext}"
        
        # Full physical path
        full_file_path = camera_dir / filename
        
        # Save file
        with open(full_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"[Evidence Upload] ✅ File saved to: {full_file_path}")
        
        # Compute SHA256 hash
        with open(full_file_path, "rb") as f:
            sha256_hash = hashlib.sha256(f.read()).hexdigest()
        
        print(f"[Evidence Upload] SHA256: {sha256_hash}")
        
        # ✅ CRITICAL: Store RELATIVE path in database (camera_{id}/filename.jpg)
        relative_path = f"camera_{camera_id}/{filename}"
        
        # Create evidence record in database
        evidence_data = schemas.EvidenceCreate(
            incident_id=incident_id,
            file_path=relative_path,  # ✅ Relative path: "camera_1/snapshot_xxx.jpg"
            sha256_hash=sha256_hash,
            file_type="image",
            extra_metadata={
                "original_filename": file.filename,
                "camera_id": camera_id,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "description": description
            }
        )
        
        created_evidence = crud.create_evidence(db, evidence_data)
        print(f"[Evidence Upload] ✅ Evidence record created with ID {created_evidence.id}")
        print(f"[Evidence Upload] ✅ File path in DB: {created_evidence.file_path}")
        print(f"[Evidence Upload] ✅ Accessible at: /evidence/{created_evidence.file_path}")

        # ── Auto-create in-DB blockchain integrity record ──────────────────
        try:
            _create_bc_record(db, incident_id=incident_id, evidence_path=str(full_file_path))
            print(f"[Evidence Upload] ⛓️  Blockchain record created for incident {incident_id}")
        except Exception as _bc_err:
            print(f"[Evidence Upload] ⚠️  Blockchain record creation failed (non-fatal): {_bc_err}")

        return created_evidence
        
    except Exception as e:
        print(f"[Evidence Upload] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Evidence upload failed: {str(e)}")


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
    
    # ── Always create the in-DB blockchain integrity record ────────────────
    # This is separate from the optional external blockchain node below.
    # The internal record is created synchronously so the status endpoint
    # can return data immediately after evidence creation.
    try:
        _create_bc_record(db, incident_id=evidence.incident_id, evidence_path=created_evidence.file_path)
        print(f"[Blockchain] ⛓️  In-DB blockchain record created for incident {evidence.incident_id}")
    except Exception as _bc_err:
        print(f"[Blockchain] ⚠️  In-DB blockchain record creation failed (non-fatal): {_bc_err}")

    # Register evidence hash on blockchain and save tx hash (in try-catch to not fail evidence creation)
    try:
        blockchain_service = get_blockchain_service()
        if not blockchain_service:
            print("[Blockchain] External blockchain service not available, skipping on-chain registration")
            # Do NOT return early – let execution continue to the return below
            
        # Build correct path to evidence file
        evidence_file_path = created_evidence.file_path
        
        # AI worker saves files to: PROJECT_ROOT/ai_worker/data/captures/camera_0/file.jpg
        # And sends relative path: camera_0/file.jpg
        import os
        # Resolve repository root (evidence.py is at: backend/app/api/v1/evidence.py)
        # parents[4] -> <repo_root>
        project_root = Path(__file__).resolve().parents[4]
        full_file_path = project_root / "ai_worker" / "data" / "captures" / evidence_file_path
        
        print(f"[Blockchain] Looking for evidence file: {full_file_path}")
        
        if not full_file_path.exists():
            print(f"[Blockchain] Evidence file not found at: {full_file_path}")
            # Try alternative path (old location for backwards compatibility)
            # Legacy fallback (old location prior to migration)
            alt_path = Path("C:/Users/dell/Desktop/Project/data/captures") / evidence_file_path
            if alt_path.exists():
                full_file_path = alt_path
                print(f"[Blockchain] Found evidence at old location: {full_file_path}")
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
    print(f"[get_my_evidence] User: {current_user.username}, Role: {current_user.role}, ID: {current_user.id}")
    
    # Security role check
    if current_user.role == "security":
        raise HTTPException(
            status_code=403, 
            detail="Security role cannot access evidence directly"
        )
    
    # Get all evidence based on user role
    if current_user.role == "admin":
        # Admin sees all evidence - ordered by newest first
        evidence_list = db.query(models.Evidence).order_by(
            models.Evidence.created_at.desc()
        ).all()
        print(f"[get_my_evidence] Admin - returning {len(evidence_list)} evidence items")
    else:
        # Users see evidence from their owned cameras
        # First get user's camera IDs
        user_cameras = db.query(models.Camera).filter(
            models.Camera.admin_user_id == current_user.id
        ).all()
        user_camera_ids = [cam.id for cam in user_cameras]
        
        print(f"[get_my_evidence] User owns {len(user_camera_ids)} cameras: {user_camera_ids}")
        
        if not user_camera_ids:
            print(f"[get_my_evidence] User has no cameras - returning empty list")
            return []
        
        # Get ALL incidents from those cameras (no date filter)
        user_incidents = db.query(models.Incident).filter(
            models.Incident.camera_id.in_(user_camera_ids)
        ).all()
        user_incident_ids = [inc.id for inc in user_incidents]
        
        print(f"[get_my_evidence] Found {len(user_incident_ids)} incidents from user's cameras")
        
        if not user_incident_ids:
            print(f"[get_my_evidence] No incidents from user's cameras - returning empty list")
            return []
        
        # Get ALL evidence from those incidents - ordered by newest first
        evidence_list = db.query(models.Evidence).filter(
            models.Evidence.incident_id.in_(user_incident_ids)
        ).order_by(
            models.Evidence.created_at.desc()
        ).all()
        
        print(f"[get_my_evidence] Returning {len(evidence_list)} evidence items")
        if evidence_list:
            first_evidence = evidence_list[0]
            print(f"[get_my_evidence] First evidence: ID={first_evidence.id}, Incident={first_evidence.incident_id}, File={first_evidence.file_path}")
        else:
            print(f"[get_my_evidence] ⚠️ NO EVIDENCE FOUND!")
            print(f"[get_my_evidence] User camera IDs: {user_camera_ids}")
            print(f"[get_my_evidence] Incident IDs from those cameras: {user_incident_ids}")
            print(f"[get_my_evidence] This means incidents exist but no evidence records were created in database!")
            print(f"[get_my_evidence] Check if AI worker is creating evidence when detecting incidents.")
    
    return [schemas.EvidenceOut.from_orm(e) for e in evidence_list]

@router.get("/by-incident/{incident_id}", response_model=List[schemas.EvidenceOut])
def read_evidence_by_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get all evidence for a specific incident"""
    incident = crud.get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    # Access check via incident
    if current_user.role != "admin" and incident.camera.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No access")
    evidence_list = db.query(models.Evidence).filter(models.Evidence.incident_id == incident_id).all()
    return [schemas.EvidenceOut.from_orm(e) for e in evidence_list]

@router.get("/item/{evidence_id}", response_model=schemas.EvidenceOut)
def read_single_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a single evidence item by ID"""
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
    
    # Get full file path (evidence stored in ai_worker/data/captures)
    evidence_base = Path(__file__).resolve().parents[4] / "ai_worker" / "data" / "captures"
    provided = Path(evidence.file_path)
    # Resolve file path robustly whether relative like "camera_id/file.jpg",
    # prefixed with "data/captures/..." or absolute.
    if provided.is_absolute():
        file_path = provided
    else:
        # If the path already includes data/captures, join from repo root
        if str(provided).replace("\\", "/").startswith("data/captures"):
            file_path = Path(__file__).resolve().parents[4] / "ai_worker" / provided
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