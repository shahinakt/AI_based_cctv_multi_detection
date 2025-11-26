# app/dependencies.py
from typing import List, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from .core.database import get_db
from .core.config import settings
from .core.security import ALGORITHM, SECRET_KEY  # ✅ use the SAME values as token creation
from . import crud, models, schemas

# This is only for OpenAPI docs; the important part is decode below
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> models.User:
    """
    Decode JWT, fetch user from DB, and return the models.User object.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # ✅ Decode with SAME SECRET_KEY + ALGORITHM as used in create_access_token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        # Any decode error → 401
        raise credentials_exception

    # In your login, you put email into "sub":
    # access_token = create_access_token(subject=user.email, role=user.role.value)
    user = crud.get_user_by_email(db, email=username)
    if user is None:
        raise credentials_exception

    return user


def role_check(required_roles: List[str]) -> Callable:
    """
    Dependency factory: ensure current user has one of the required roles.
    Usage:
        current_user: schemas.UserOut = Depends(role_check(["admin"]))
    """

    def dependency(current_user: models.User = Depends(get_current_user)):
        # If your User.role is an Enum, you may need current_user.role.value
        role_value = (
            current_user.role.value if hasattr(current_user.role, "value") else current_user.role
        )
        if role_value not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return dependency
