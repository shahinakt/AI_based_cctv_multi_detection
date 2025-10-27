from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import crud, schemas
from .core import security
from .core.database import get_db
from typing import List

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

async def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> schemas.UserOut:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = security.verify_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except HTTPException:
        raise credentials_exception
    user = crud.get_user_by_username(db, username=username)
    if user is None or not user.is_active:
        raise credentials_exception
    return schemas.UserOut.from_orm(user)

def role_check(allowed_roles: List[str]):
    def role_checker(
        current_user: schemas.UserOut = Depends(get_current_user)
    ):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return role_checker