from fastapi import APIRouter

from . import auth, users, cameras, incidents, evidence, notifications, stream_handler

api_v1_router = APIRouter(prefix="/api/v1")

# /api/v1/auth/...
api_v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# /api/v1/users/... (users router already has prefix="/users")
api_v1_router.include_router(users.router)

# /api/v1/cameras/... (assuming cameras.router has prefix="/cameras")
api_v1_router.include_router(cameras.router)

# /api/v1/incidents/... (assuming incidents.router has prefix="/incidents")
api_v1_router.include_router(incidents.router)

# /api/v1/evidence/...
api_v1_router.include_router(evidence.router, prefix="/evidence", tags=["evidence"])

# /api/v1/notifications/...
api_v1_router.include_router(
    notifications.router, prefix="/notifications", tags=["notifications"]
)

# /api/v1/stream/...
api_v1_router.include_router(
    stream_handler.router, prefix="/stream", tags=["stream"]
)


