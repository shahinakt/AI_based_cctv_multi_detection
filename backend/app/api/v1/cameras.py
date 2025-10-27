from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ... import crud, schemas
from ...core.database import get_db
from ...dependencies import get_current_user, role_check

router = APIRouter()

@router.get("/", response_model=List[schemas.CameraOut])
def read_cameras(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.role == "admin":
        admin_id = None
    else:
        admin_id = current_user.id  # Security sees own cameras
    return crud.get_cameras(db, skip=skip, limit=limit, admin_user_id=admin_id)

@router.post("/", response_model=schemas.CameraOut)
def create_camera(
    camera: schemas.CameraCreate,
    db: Session = Depends(get_db),
    current_user: schemas.UserOut = Depends(role_check(["admin"]))
):
    # Ensure admin_user_id matches current or specified
    if camera.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot assign to other admin")
    return crud.create_camera(db=db, camera=camera)

@router.get("/{camera_id}", response_model=schemas.CameraOut)
def read_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    camera = crud.get_camera(db, camera_id=camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    # Check access: admin all, security own
    if current_user.role != "admin" and camera.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No access to this camera")
    return camera

@router.put("/{camera_id}", response_model=schemas.CameraOut)
def update_camera(
    camera_id: int,
    camera_update: schemas.CameraUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.UserOut = Depends(role_check(["admin"]))
):
    updated = crud.update_camera(db, camera_id=camera_id, camera_update=camera_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Camera not found")
    return updated

@router.delete("/{camera_id}", response_model=dict)
def delete_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.UserOut = Depends(role_check(["admin"]))
):
    success = crud.delete_camera(db, camera_id=camera_id)
    if not success:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"msg": "Camera deleted"}

@router.put("/{camera_id}/sensitivity", response_model=dict)
def update_sensitivity(
    camera_id: int,
    settings_update: schemas.SensitivitySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.UserOut = Depends(role_check(["admin"]))
):
    updated = crud.update_sensitivity_settings(db, camera_id=camera_id, settings_update=settings_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Settings not found")
    return {"msg": "Sensitivity updated"}