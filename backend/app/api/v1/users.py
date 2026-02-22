from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user, role_check

# All users endpoints will be under /api/v1/users/...
# Note: prefix is added in __init__.py, so don't add it here
router = APIRouter(tags=["users"])


class PushTokenRequest(BaseModel):
    expo_push_token: str
    platform: str | None = "android"


@router.get("/me", response_model=schemas.UserOut)
def read_users_me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/register-push-token")
def register_push_token(
    data: PushTokenRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Register a device push token for the current user.
    Stores tokens in the `device_tokens` table (no schema change needed).
    """
    try:
        token_create = schemas.DeviceTokenCreate(
            user_id=current_user.id,
            token=data.expo_push_token,
            platform=(data.platform or "android")
        )
        created = crud.create_device_token(db, token_create)
        return {
            "success": True,
            "message": "Push token registered successfully",
            "user_id": current_user.id,
            "device_token_id": created.id
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to register push token: {str(e)}"
        )


@router.get("/", response_model=List[schemas.UserOut])
def read_users(
    skip: int = 0,
    limit: int = 100,
    role: str = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get users - accessible by authenticated users.
    Admins can see all users, others see only security users.
    Use ?role=security query param to filter for security users only.
    """
    # If user is admin, return all users or filtered by role
    if current_user.role == models.RoleEnum.admin:
        if role:
            return db.query(models.User).filter(
                models.User.role == models.RoleEnum(role)
            ).offset(skip).limit(limit).all()
        return crud.get_users(db, skip=skip, limit=limit)
    
    # Non-admin users can only see security users
    return db.query(models.User).filter(
        models.User.role == models.RoleEnum.security
    ).offset(skip).limit(limit).all()


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
    current_user=Depends(get_current_user),
):
    # Allow users to update their own profile, or admins to update anyone
    if current_user.role != models.RoleEnum.admin and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. You can only update your own profile."
        )
    
    # Non-admin users cannot change their email or role
    if current_user.role != models.RoleEnum.admin:
        if user_update.email is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot change your email address."
            )
        if user_update.role is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot change your role."
            )
    
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



