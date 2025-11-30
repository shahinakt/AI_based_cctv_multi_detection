"""
backend/app/api/v1/__init__.py - COMPLETE VERSION
Properly integrates all routers including camera_status
"""
from fastapi import APIRouter

from . import (
    auth,
    users,
    cameras,
    camera_status,  # NEW: Camera status updates from AI worker
    incidents,
    evidence,
    notifications,
    stream_handler
)

# Create API v1 router
api_v1_router = APIRouter(prefix="/api/v1")

# Camera status endpoints: included under /api/v1/cameras
api_v1_router.include_router(
    camera_status.router,
    prefix="/cameras",
    tags=["camera_status"],
)

# Auth endpoints: /api/v1/auth/...
api_v1_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["auth"]
)

# User endpoints: /api/v1/users/...
api_v1_router.include_router(
    users.router,
    tags=["users"]
)

# Camera endpoints: /api/v1/cameras/...
api_v1_router.include_router(
    cameras.router,
    prefix="/cameras",
    tags=["cameras"]
)

# Incidents endpoints: /api/v1/incidents/...
api_v1_router.include_router(
    incidents.router,
    prefix="/incidents",
    tags=["incidents"]
)

# Evidence endpoints: /api/v1/evidence/...
api_v1_router.include_router(
    evidence.router,
    prefix="/evidence",
    tags=["evidence"]
)

# Notifications endpoints: /api/v1/notifications/...
api_v1_router.include_router(
    notifications.router,
    prefix="/notifications",
    tags=["notifications"]
)

# Stream processing endpoints: /api/v1/stream/...
api_v1_router.include_router(
    stream_handler.router,
    prefix="/stream",
    tags=["stream"]
)

# Camera status endpoints: /api/v1/cameras/{camera_id}/status
# Note: This is included in app/__init__.py separately to avoid prefix conflicts
# The camera_status router has endpoints like PUT /api/v1/cameras/{camera_id}/status

__all__ = ["api_v1_router"]