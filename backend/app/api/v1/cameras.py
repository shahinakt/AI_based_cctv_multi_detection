"""
backend/app/api/v1/cameras.py - FIXED VERSION
Supports dynamic camera registration with AI worker integration
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import httpx
import asyncio

from ... import crud, schemas, models
import logging

logger = logging.getLogger(__name__)

from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user, role_check
from ...models import RoleEnum as ModelRoleEnum
from sqlalchemy import or_

router = APIRouter()

# AI Worker communication
AI_WORKER_BASE_URL = "http://localhost:8000"  # Adjust if different


async def notify_ai_worker_camera_added(camera_id: int, camera_config: dict):
    """
    Notify AI worker that a new camera was added
    AI worker should start processing this camera
    """
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
                print(f"✅ AI Worker notified: Camera {camera_id} started")
            else:
                print(f"⚠️ AI Worker notification failed: {response.text}")
    except Exception as e:
        print(f"❌ Failed to notify AI worker: {e}")


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
                print(f"✅ AI Worker notified: Camera {camera_id} stopped")
    except Exception as e:
        print(f"❌ Failed to notify AI worker: {e}")


# -----------------------------------------------------
# 1️⃣ LIST CAMERAS (with streaming status)
# -----------------------------------------------------
@router.get("/", response_model=List[schemas.CameraOut])
def list_cameras(
    skip: int = 0,
    limit: int = 100,
    admin_user_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List cameras with their current streaming status"""
    # Normalize role value (support Enum or plain string)
    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    # Security role should not have access to camera listing
    if str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Security role not permitted to list cameras")
    # Admin → all cameras
    if str(role_value) == str(ModelRoleEnum.admin.value):
        # Admins can optionally filter by owner (admin_user_id) via query param
        if admin_user_id:
            cameras = crud.get_cameras(db, skip=skip, limit=limit, admin_user_id=admin_user_id)
        else:
            cameras = crud.get_cameras(db, skip=skip, limit=limit)
    else:
        # Security / Viewer → only own cameras
        # Security / Viewer → show their own cameras PLUS any active cameras
        # This lets viewers see publicly-active camera feeds while still restricting
        # edit/delete actions to owners/admins.
        cameras_query = db.query(models.Camera).filter(
            or_(models.Camera.admin_user_id == current_user.id, models.Camera.is_active == True)
        )
        cameras = cameras_query.offset(skip).limit(limit).all()
    
    # Enrich with streaming status from camera_status table
    result = []
    for camera in cameras:
        camera_dict = schemas.CameraOut.from_orm(camera).dict()
        # Add owner username to response so admins can easily see who owns each camera
        try:
            camera_dict["admin_username"] = camera.admin_user.username if camera.admin_user else None
        except Exception:
            camera_dict["admin_username"] = None
        
        # Get streaming status (best-effort). If the camera_status table isn't present
        # (migrations not applied), the query will raise — catch and continue.
        try:
            status = db.query(models.CameraStatus).filter(
                models.CameraStatus.camera_id == camera.id
            ).first()
        except Exception as e:
            logger.warning("camera_status lookup failed (migrations missing?): %s", e)
            status = None

        if status:
            camera_dict["streaming_status"] = status.status
            camera_dict["fps"] = status.fps
            camera_dict["last_frame_time"] = status.last_frame_time
        else:
            camera_dict["streaming_status"] = "inactive"
            camera_dict["fps"] = 0.0
            camera_dict["last_frame_time"] = None
        
        result.append(camera_dict)
    
    return result


# -----------------------------------------------------
# 2️⃣ CREATE CAMERA (with AI worker auto-start)
# -----------------------------------------------------
@router.post("/", response_model=schemas.CameraOut)
async def create_camera(
    camera_in: schemas.CameraCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Create new camera and automatically start AI processing.

    - Viewer: max 4 cameras, owned by themselves
    - Security: unlimited, owned by themselves
    - Admin: unlimited, owned by themselves (you can extend later)
    """

    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    # Disallow security role from creating/managing cameras
    if str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Security role not permitted to create cameras")

    # Enforce viewer limit: max 4 cameras per viewer
    if str(role_value) == str(ModelRoleEnum.viewer.value):
        # Count cameras owned by this user
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
            logger.warning("Failed counting owned cameras for limit enforcement: %s", e)

    # VIEWER: allow creation (no hard cap enforced here). If you want a limit,
    # re-enable the check below and adjust the allowed number.
    # Example (re-enable to limit to 4):
    # if current_user.role == ModelRoleEnum.viewer:
    #     existing = crud.get_cameras(db, admin_user_id=current_user.id)
    #     if len(existing) >= 4:
    #         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Viewers can only add up to 4 cameras.")

    # For now, owner is always the logged-in user
    owner_id = current_user.id

    # Build data dict for create
    camera_data = camera_in.dict()
    camera_data["admin_user_id"] = owner_id

    # Create in database
    created = crud.create_camera(db=db, camera=camera_data)

    # Create camera status entry (best-effort)
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
        # If the camera_status table doesn't exist (migrations not applied), log and continue.
        db.rollback()
        logger.warning(
            "Could not create camera_status row (continuing). Ensure Alembic migrations are applied: %s",
            e,
        )

    # Notify AI worker to start processing (best-effort; ok if it fails)
    camera_config = {
        "camera_id": created.id,
        "stream_url": created.stream_url,   # ✅ use stream_url
        "name": created.name,
        "location": created.location,
        "device": "cuda:0",  # AI worker can override
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



# -----------------------------------------------------
# 3️⃣ READ SINGLE CAMERA
# -----------------------------------------------------
@router.get("/{camera_id}", response_model=schemas.CameraOut)
def read_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )

    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    # Admin can see any
    if str(role_value) == str(ModelRoleEnum.admin.value):
        return camera

    # Security role should not be allowed to read individual cameras
    if str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Security role not permitted to access camera details")

    # Others (viewers) must own the camera
    if camera.admin_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this camera",
        )

    return camera


# -----------------------------------------------------
# 4️⃣ UPDATE CAMERA
# -----------------------------------------------------
@router.put("/{camera_id}", response_model=schemas.CameraOut)
def update_camera(
    camera_id: int,
    camera_update: schemas.CameraUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Allow admins or the camera owner to update camera fields.
    Previous implementation allowed admin-only updates which prevented
    viewer owners from editing their own cameras in the UI.
    """
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    is_admin = str(role_value) == str(ModelRoleEnum.admin.value)
    is_owner = camera.admin_user_id == current_user.id

    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permission to update this camera")

    updated = crud.update_camera(db, camera_id=camera_id, camera_update=camera_update)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")
    return updated


# -----------------------------------------------------
# 5️⃣ DELETE CAMERA (with AI worker stop notification)
# -----------------------------------------------------
@router.delete("/{camera_id}", response_model=dict)
async def delete_camera(
    camera_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete camera and stop AI processing"""
    logger.info("DELETE camera request: id=%s by user id=%s role=%s", camera_id, getattr(current_user, 'id', None), getattr(current_user, 'role', None))
    # Verify camera exists and permissions: owner or admin can delete
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    # Security role explicitly disallowed from deleting cameras
    if str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Security role not permitted to delete cameras")

    # Allow admin (by role) or owner (by id). Normalize comparisons so strings and enums both work.
    is_admin = str(role_value) == str(ModelRoleEnum.admin.value)
    is_owner = camera.admin_user_id == current_user.id

    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permission to delete this camera")

    # Notify AI worker to stop processing
    background_tasks.add_task(notify_ai_worker_camera_removed, camera_id)

    # Delete from database
    success = crud.delete_camera(db, camera_id=camera_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )
    
    return {"msg": "Camera deleted and processing stopped"}


# -----------------------------------------------------
# 6️⃣ GET CAMERA STATUS (real-time streaming info)
# -----------------------------------------------------
@router.get("/{camera_id}/status", response_model=schemas.CameraStatusOut)
def get_camera_status(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get real-time streaming status for camera"""
    
    # Verify camera access
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    role_value = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    # Security role should not have access to camera status
    if str(role_value) == str(ModelRoleEnum.security.value):
        raise HTTPException(status_code=403, detail="Security role not permitted to access camera status")

    is_admin = str(role_value) == str(ModelRoleEnum.admin.value)
    if not (is_admin or camera.admin_user_id == current_user.id):
        raise HTTPException(status_code=403, detail="No access")
    
    # Get status
    status = db.query(models.CameraStatus).filter(
        models.CameraStatus.camera_id == camera_id
    ).first()
    
    if not status:
        raise HTTPException(status_code=404, detail="Status not available")
    
    return status


# -----------------------------------------------------
# 7️⃣ UPDATE SENSITIVITY
# -----------------------------------------------------
@router.put("/{camera_id}/sensitivity", response_model=dict)
def update_sensitivity(
    camera_id: int,
    settings_update: schemas.SensitivitySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.UserOut = Depends(role_check(["admin"])),
):
    updated = crud.update_sensitivity_settings(
        db, camera_id=camera_id, settings_update=settings_update
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Settings not found"
        )
    return {"msg": "Sensitivity updated"}