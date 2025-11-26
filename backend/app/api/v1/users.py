from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ... import crud, schemas
from ...core.database import get_db
from ...dependencies import get_current_user, role_check

# All users endpoints will be under /api/v1/users/...
router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=schemas.UserOut)
def read_users_me(current_user=Depends(get_current_user)):
    return current_user


@router.get("/", response_model=List[schemas.UserOut])
def read_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(role_check(["admin"])),
):
    users = crud.get_users(db, skip=skip, limit=limit)
    return users


@router.post(
    "/", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED
)
def create_user_for_admin(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(role_check(["admin"])),
):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    created_user = crud.create_user(db=db, user=user)
    return created_user


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user_for_admin(
    user_id: int,
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(role_check(["admin"])),
):
    updated_user = crud.update_user(db, user_id=user_id, user_update=user_update)
    if updated_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return updated_user


@router.delete("/{user_id}", response_model=dict)
def delete_user_for_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_check(["admin"])),
):
    success = crud.delete_user(db, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"msg": "User deleted successfully"}


@router.get("/{user_id}/overview", response_model=schemas.UserOverview)
def user_overview(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(role_check(["admin"])),
):
    user = crud.get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cameras = crud.get_cameras_by_admin(db, admin_user_id=user_id)
    incidents = crud.get_incidents_for_admin_cameras(db, admin_user_id=user_id)

    return schemas.UserOverview(
        user=user,
        cameras=cameras,
        incidents=incidents,
    )



