"""
backend/app/api/v1/cameras.py - FIXED VERSION
Adds AI Worker authentication bypass for camera fetching
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Header
from sqlalchemy.orm import Session
from typing import List, Optional
import httpx
import asyncio

from ... import crud, schemas, models
import os
import logging

logger = logging.getLogger(__name__)

from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user, get_current_user_optional, role_check
from ...models import RoleEnum as ModelRoleEnum
from ...core.config import settings
from sqlalchemy import or_

router = APIRouter()

AI_WORKER_BASE_URL = os.getenv("AI_WORKER_BASE_URL", "http://localhost:8765")

# ✅ NEW: AI Worker authentication key (shared secret)
AI_WORKER_SERVICE_KEY = os.getenv("AI_WORKER_SERVICE_KEY", "ai-worker-secret-key-change-in-production")


async def notify_ai_worker_camera_added(camera_id: int, camera_config: dict):
    """Notify AI worker that a new camera was added"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{AI_WORKER_BASE_URL}/api/worker/cameras/start",
                json={
                    "camera_id": camera_id,
                    "config": camera_config
                },
                timeout=10.0
            )
            if response.status_code == 200:
                logger.info(f"✅ AI Worker notified: Camera {camera_id} started")
            else:
                logger.warning(f"⚠️ AI Worker notification failed: {response.text}")
    except Exception as e:
        logger.error(f"❌ Failed to notify AI worker: {e}")


async def notify_ai_worker_camera_removed(camera_id: int):
    """Notify AI worker to stop processing a camera"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{AI_WORKER_BASE_URL}/api/worker/cameras/stop",
                json={"camera_id": camera_id},
                timeout=10.0
            )
            if response.status_code == 200:
                logger.info(f"✅ AI Worker notified: Camera {camera_id} stopped")
    except Exception as e:
        logger.error(f"❌ Failed to notify AI worker: {e}")


def _verify_ai_worker_auth(x_ai_worker_key: Optional[str]) -> bool:
    """
    Verify AI Worker authentication
    Returns True if request is from authenticated AI worker
    """
    if not x_ai_worker_key:
        return False
    
    # Compare with configured service key
    return x_ai_worker_key == AI_WORKER_SERVICE_KEY


# ✅ FIXED: Allow AI worker to fetch cameras without user authentication
@router.get("/", response_model=List[schemas.CameraOut])
def list_cameras(
    skip: int = 0,
    limit: int = 100,
    admin_user_id: int | None = None,
    db: Session = Depends(get_db),
    x_ai_worker_key: Optional[str] = Header(None, alias="X-AI-Worker-Key"),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
):
    """
    List cameras with streaming status
    
    Authentication:
    - AI Worker: Use X-AI-Worker-Key header
    - Users: Standard JWT token (via current_user dependency)
    """
    # ✅ Check if request is from AI worker
    is_ai_worker = _verify_ai_worker_auth(x_ai_worker_key)
    
    if is_ai_worker:
        # AI Worker gets all active cameras
        logger.info("📡 AI Worker authenticated: returning all active cameras")
        cameras = db.query(models.Camera).filter(models.Camera.is_active == True).offset(skip).limit(limit).all()
    else:
        # Regular user authentication required
        if current_user is None:
            # No AI worker key AND no user token → 401
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Provide JWT token or X-AI-Worker-Key header."
            )
        
        role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
        
        if str(role_value) == str(ModelRoleEnum.security.value):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Security role not permitted to list cameras")
        
        if str(role_value) == str(ModelRoleEnum.admin.value):
            if admin_user_id:
                cameras = crud.get_cameras(db, skip=skip, limit=limit, admin_user_id=admin_user_id)
            else:
                cameras = crud.get_cameras(db, skip=skip, limit=limit)
        else:
            cameras_query = db.query(models.Camera).filter(
                or_(models.Camera.admin_user_id == current_user.id, models.Camera.is_active == True)
            )
            cameras = cameras_query.offset(skip).limit(limit).all()
    
    # Enrich with streaming status
    result = []
    for camera in cameras:
        camera_dict = schemas.CameraOut.from_orm(camera).dict()
        
        try:
            camera_dict["admin_username"] = camera.admin_user.username if camera.admin_user else None
        except Exception:
            camera_dict["admin_username"] = None
        
        try:
            status_obj = db.query(models.CameraStatus).filter(
                models.CameraStatus.camera_id == camera.id
            ).first()
        except Exception as e:
            logger.warning("camera_status lookup failed: %s", e)
            status_obj = None

        if status_obj:
            camera_dict["fps"] = status_obj.fps
            camera_dict["last_frame_time"] = status_obj.last_frame_time
            if getattr(status_obj, "status", None) == "running":
                camera_dict["streaming_status"] = "active"
                camera_dict["is_active"] = True
            else:
                camera_dict["streaming_status"] = "inactive"
                camera_dict["is_active"] = False
        else:
            camera_dict["fps"] = 0.0
            camera_dict["last_frame_time"] = None
            camera_dict["is_active"] = bool(getattr(camera, "is_active", False))
            camera_dict["streaming_status"] = "active" if camera_dict["is_active"] else "inactive"
        
        result.append(camera_dict)
    
    return result


@router.post("/", response_model=schemas.CameraOut)
async def create_camera(
    camera_in: schemas.CameraCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create new camera and automatically start AI processing"""
    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    
    if str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Security role not permitted to create cameras")

    if str(role_value) == str(ModelRoleEnum.viewer.value):
        try:
            owned = crud.get_cameras(db, admin_user_id=current_user.id)
            if len(owned) >= 4:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Viewers can only add up to 4 cameras. Delete an existing camera to add a new one.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("Failed counting owned cameras: %s", e)

    owner_id = current_user.id
    camera_data = camera_in.dict()
    camera_data["admin_user_id"] = owner_id

    created = crud.create_camera(db=db, camera=camera_data)

    camera_status = models.CameraStatus(
        camera_id=created.id,
        status="starting",
        fps=0.0,
        total_frames=0,
        total_incidents=0,
    )
    try:
        db.add(camera_status)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("Could not create camera_status: %s", e)

    camera_config = {
        "camera_id": created.id,
        "stream_url": created.stream_url,
        "name": created.name,
        "location": created.location,
        "device": "cuda:0",
        "resolution": (640, 480),
        "process_every_n_frames": 1,
        "enable_incidents": True,
        "enable_pose": False,
    }
    background_tasks.add_task(
        notify_ai_worker_camera_added,
        created.id,
        camera_config,
    )

    return created


@router.get("/{camera_id}", response_model=schemas.CameraOut)
def read_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get single camera details"""
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )

    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    
    if str(role_value) == str(ModelRoleEnum.admin.value):
        pass  # Admin can see any
    elif str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Security role not permitted")
    else:
        if camera.admin_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access")

    camera_dict = schemas.CameraOut.from_orm(camera).dict()
    try:
        status_obj = db.query(models.CameraStatus).filter(models.CameraStatus.camera_id == camera.id).first()
    except Exception:
        status_obj = None

    if status_obj and getattr(status_obj, "status", None) == "running":
        camera_dict["streaming_status"] = "active"
        camera_dict["is_active"] = True
        camera_dict["fps"] = status_obj.fps
        camera_dict["last_frame_time"] = status_obj.last_frame_time
    else:
        camera_dict["is_active"] = bool(getattr(camera, "is_active", False))
        camera_dict["streaming_status"] = "active" if camera_dict["is_active"] else "inactive"
        camera_dict.setdefault("fps", 0.0)
        camera_dict.setdefault("last_frame_time", None)

    return camera_dict


@router.put("/{camera_id}", response_model=schemas.CameraOut)
def update_camera(
    camera_id: int,
    camera_update: schemas.CameraUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update camera (owner or admin only)"""
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    is_admin = str(role_value) == str(ModelRoleEnum.admin.value)
    is_owner = camera.admin_user_id == current_user.id

    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permission")

    previous_is_active = camera.is_active

    updated = crud.update_camera(db, camera_id=camera_id, camera_update=camera_update)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    try:
        new_is_active = getattr(updated, 'is_active', None)
        if previous_is_active is not None and new_is_active is not None and previous_is_active != new_is_active:
            if new_is_active:
                camera_config = {
                    "camera_id": updated.id,
                    "stream_url": updated.stream_url,
                    "name": updated.name,
                    "location": updated.location,
                    "device": "cuda:0",
                    "resolution": (640, 480),
                    "process_every_n_frames": 1,
                    "enable_incidents": True,
                    "enable_pose": False,
                }
                background_tasks.add_task(notify_ai_worker_camera_added, updated.id, camera_config)
            else:
                background_tasks.add_task(notify_ai_worker_camera_removed, updated.id)
    except Exception as e:
        logger.warning("Failed AI worker notification: %s", e)

    return updated


@router.delete("/{camera_id}", response_model=dict)
async def delete_camera(
    camera_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete camera (owner or admin only)"""
    logger.info("DELETE camera: id=%s by user id=%s", camera_id, current_user.id)
    
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    
    if str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Security role not permitted")

    is_admin = str(role_value) == str(ModelRoleEnum.admin.value)
    is_owner = camera.admin_user_id == current_user.id

    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permission")

    background_tasks.add_task(notify_ai_worker_camera_removed, camera_id)

    success = crud.delete_camera(db, camera_id=camera_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    
    return {"msg": "Camera deleted and processing stopped"}


@router.get("/{camera_id}/status", response_model=schemas.CameraStatusOut)
def get_camera_status(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get real-time streaming status"""
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    
    if str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=403, detail="Security role not permitted")

    is_admin = str(role_value) == str(ModelRoleEnum.admin.value)
    if not (is_admin or camera.admin_user_id == current_user.id):
        raise HTTPException(status_code=403, detail="No access")
    
    status_obj = db.query(models.CameraStatus).filter(
        models.CameraStatus.camera_id == camera_id
    ).first()
    
    if not status_obj:
        raise HTTPException(status_code=404, detail="Status not available")
    
    return status_obj


@router.put("/{camera_id}/sensitivity", response_model=dict)
def update_sensitivity(
    camera_id: int,
    settings_update: schemas.SensitivitySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.UserOut = Depends(role_check(["admin"])),
):
    """Update sensitivity settings (admin only)"""
    updated = crud.update_sensitivity_settings(
        db, camera_id=camera_id, settings_update=settings_update
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Settings not found")
    return {"msg": "Sensitivity updated"}