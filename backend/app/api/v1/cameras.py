from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user, role_check
from ...models import RoleEnum as ModelRoleEnum

router = APIRouter()


# -----------------------------------------------------
# 1️⃣ LIST CAMERAS
#   - Admin  → all cameras
#   - Others → only their own
# -----------------------------------------------------
@router.get("/", response_model=List[schemas.CameraOut])
def list_cameras(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Admin → all cameras
    if current_user.role == ModelRoleEnum.admin:
        return crud.get_cameras(db, skip=skip, limit=limit)

    # Security / Viewer → only own cameras
    return crud.get_cameras(
        db, skip=skip, limit=limit, admin_user_id=current_user.id
    )


# Optional helper if other code wants to use CRUD directly
def read_cameras(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    admin_id = None if current_user.role == ModelRoleEnum.admin else current_user.id
    return crud.get_cameras(db, skip=skip, limit=limit, admin_user_id=admin_id)


# -----------------------------------------------------
# 2️⃣ CREATE CAMERA
#   - Viewer  → can create, MAX 4 (for themselves only)
#   - Security→ can create for themselves
#   - Admin   → can create for any user (if admin_user_id given)
# -----------------------------------------------------
@router.post("/", response_model=schemas.CameraOut)
def create_camera(
    camera: schemas.CameraCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # VIEWER: max 4 + only self-owned cameras
    if current_user.role == ModelRoleEnum.viewer:
        # enforce ownership
        if camera.admin_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Viewers can only assign cameras to themselves.",
            )

        # check limit
        existing = crud.get_cameras(db, admin_user_id=current_user.id)
        if len(existing) >= 4:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Viewers can only add up to 4 cameras.",
            )

        owner_id = current_user.id

    # SECURITY: can create cameras, but only for themselves
    elif current_user.role == ModelRoleEnum.security:
        if camera.admin_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only assign cameras to yourself.",
            )
        owner_id = current_user.id

    # ADMIN: can create for any user (or themselves if not specified)
    else:
        owner_id = camera.admin_user_id or current_user.id

    # Build a new payload with enforced owner_id
    camera_data = camera.dict()
    camera_data["admin_user_id"] = owner_id
    camera_fixed = schemas.CameraCreate(**camera_data)

    created = crud.create_camera(db=db, camera=camera_fixed)
    return created


# -----------------------------------------------------
# 3️⃣ READ SINGLE CAMERA
#   - Admin  → any camera
#   - Others → only own camera
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

    # Admin can see any
    if current_user.role == ModelRoleEnum.admin:
        return camera

    # Others must own the camera
    if camera.admin_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this camera",
        )

    return camera


# -----------------------------------------------------
# 4️⃣ UPDATE CAMERA
#   - Admin only (your requirement)
# -----------------------------------------------------
@router.put("/{camera_id}", response_model=schemas.CameraOut)
def update_camera(
    camera_id: int,
    camera_update: schemas.CameraUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.UserOut = Depends(role_check(["admin"])),
):
    updated = crud.update_camera(db, camera_id=camera_id, camera_update=camera_update)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )
    return updated


# -----------------------------------------------------
# 5️⃣ DELETE CAMERA
#   - Admin only (your requirement)
# -----------------------------------------------------
@router.delete("/{camera_id}", response_model=dict)
def delete_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.UserOut = Depends(role_check(["admin"])),
):
    success = crud.delete_camera(db, camera_id=camera_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found"
        )
    return {"msg": "Camera deleted"}


# -----------------------------------------------------
# 6️⃣ UPDATE SENSITIVITY
#   - Admin only (unchanged)
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
