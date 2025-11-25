from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

# =========================
# Password hashing section
# =========================

# Use bcrypt_sha256 to avoid raw bcrypt 72-byte password limit issues
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],   # 👈 CHANGED from "bcrypt" to "bcrypt_sha256"
    deprecated="auto",
)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    Hash a plain password. Any hashing-related problem becomes a clean HTTP 400.
    """
    try:
        return pwd_context.hash(password)
    except ValueError as e:
        # Convert passlib / bcrypt ValueError into a client-visible error
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password hashing failed: {str(e)}",
        )


# =========================
# JWT section (unchanged)
# =========================

ALGORITHM = "HS256"


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    role: str = None,
) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode = {"exp": expire, "sub": subject}
    if role:
        to_encode["role"] = role

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: Optional[str] = payload.get("role")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return {"username": username, "role": role}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
