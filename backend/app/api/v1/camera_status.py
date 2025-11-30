"""
backend/app/api/v1/camera_status.py
Endpoint for AI worker to update camera status
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError, OperationalError
from datetime import datetime
import logging

from ... import models, schemas
from ...core.database import get_db, engine, Base

logger = logging.getLogger(__name__)

router = APIRouter()


def _ensure_tables_exist():
    """Create DB tables if they are missing (safe for development/test)."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables ensured via metadata.create_all")
    except Exception as e:
        logger.error("Failed to ensure DB tables: %s", e)


@router.put("/{camera_id}/status", response_model=schemas.CameraStatusOut)
@router.patch("/{camera_id}/status", response_model=schemas.CameraStatusOut)
def update_camera_status(
    camera_id: int,
    status_update: schemas.CameraStatusUpdate,
    db: Session = Depends(get_db),
):
    """
    Update camera streaming status.
    Called by AI worker during processing.
    """
    # Get or create camera status
    try:
        camera_status = (
            db.query(models.CameraStatus)
            .filter(models.CameraStatus.camera_id == camera_id)
            .first()
        )
    except (ProgrammingError, OperationalError) as e:
        logger.warning(
            "Database error when querying camera_status: %s. "
            "Attempting to create missing tables.",
            e,
        )
        db.rollback()
        _ensure_tables_exist()
        try:
            camera_status = (
                db.query(models.CameraStatus)
                .filter(models.CameraStatus.camera_id == camera_id)
                .first()
            )
        except Exception as e2:
            logger.error("Retry querying camera_status failed: %s", e2)
            raise HTTPException(status_code=500, detail=f"Database error: {e2}")

    if not camera_status:
        camera_status = models.CameraStatus(camera_id=camera_id)
        db.add(camera_status)

    # Update fields from payload (all optional)
    if status_update.status is not None:
        camera_status.status = status_update.status
        # When transitioning to running for first time
        if status_update.status == "running" and camera_status.started_at is None:
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

    if status_update.processing_device is not None:
        camera_status.processing_device = status_update.processing_device

    camera_status.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(camera_status)

    return camera_status


@router.get("/{camera_id}/status", response_model=schemas.CameraStatusOut)
def get_camera_status(
    camera_id: int,
    db: Session = Depends(get_db),
):
    """Get camera streaming status."""
    try:
        status = (
            db.query(models.CameraStatus)
            .filter(models.CameraStatus.camera_id == camera_id)
            .first()
        )
    except (ProgrammingError, OperationalError) as e:
        logger.warning(
            "Database error when querying camera_status: %s. "
            "Attempting to create missing tables.",
            e,
        )
        db.rollback()
        _ensure_tables_exist()
        try:
            status = (
                db.query(models.CameraStatus)
                .filter(models.CameraStatus.camera_id == camera_id)
                .first()
            )
        except Exception as e2:
            logger.error("Retry querying camera_status failed: %s", e2)
            raise HTTPException(status_code=500, detail=f"Database error: {e2}")

    if not status:
        raise HTTPException(status_code=404, detail="Status not found")

    return status
