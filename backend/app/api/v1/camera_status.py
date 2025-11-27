"""
backend/app/api/v1/camera_status.py - NEW FILE
Endpoint for AI worker to update camera status
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from ... import models, schemas
from ...core.database import get_db

router = APIRouter()


@router.put("/{camera_id}/status")
def update_camera_status(
    camera_id: int,
    status_update: schemas.CameraStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Update camera streaming status
    Called by AI worker during processing
    
    No authentication required - internal API for AI worker
    """
    # Get or create camera status
    camera_status = db.query(models.CameraStatus).filter(
        models.CameraStatus.camera_id == camera_id
    ).first()
    
    if not camera_status:
        # Create new status entry
        camera_status = models.CameraStatus(camera_id=camera_id)
        db.add(camera_status)
    
    # Update fields
    if status_update.status:
        camera_status.status = status_update.status
        
        # Set started_at when transitioning to 'running'
        if status_update.status == 'running' and not camera_status.started_at:
            camera_status.started_at = datetime.utcnow()
    
    if status_update.error_message is not None:
        camera_status.error_message = status_update.error_message
    
    if status_update.fps is not None:
        camera_status.fps = status_update.fps
        camera_status.last_frame_time = datetime.utcnow()
    
    if status_update.total_frames is not None:
        camera_status.total_frames = status_update.total_frames
    
    if status_update.total_incidents is not None:
        camera_status.total_incidents = status_update.total_incidents
    
    if status_update.processing_device:
        camera_status.processing_device = status_update.processing_device
    
    camera_status.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(camera_status)
    
    return {"msg": "Status updated", "status": camera_status.status}


@router.get("/{camera_id}/status", response_model=schemas.CameraStatusOut)
def get_camera_status(
    camera_id: int,
    db: Session = Depends(get_db)
):
    """Get camera streaming status"""
    status = db.query(models.CameraStatus).filter(
        models.CameraStatus.camera_id == camera_id
    ).first()
    
    if not status:
        raise HTTPException(status_code=404, detail="Status not found")
    
    return status