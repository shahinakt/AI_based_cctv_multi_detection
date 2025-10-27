from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .api.v1 import cameras
from .api.v1 import auth, cameras, incidents, evidence, notifications
from .core.config import settings
from .core.database import engine, get_db
from .dependencies import get_current_user
from .tasks.celery_app import celery_app

app = FastAPI(title="AI CCTV System API", version="1.0.0")

# CORS middleware for frontend and mobile
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, settings.MOBILE_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(cameras.router, prefix="/api/v1/users", tags=["users"])
app.include_router(cameras.router, prefix="/api/v1/cameras", tags=["cameras"])
app.include_router(incidents.router, prefix="/api/v1/incidents", tags=["incidents"])
app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["evidence"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])

# WebSocket endpoint (handled in websocket.py, but mounted here if separate)
from .api.v1.websocket import router as ws_router
app.include_router(ws_router, prefix="/ws")

# Static files for evidence (served from data/captures/)
# Resolve the captures directory relative to the repository root to avoid
# errors when running uvicorn from different working directories.
captures_dir = Path(__file__).resolve().parents[2] / "data" / "captures"
# Ensure the directory exists so StaticFiles won't raise at import time.
captures_dir.mkdir(parents=True, exist_ok=True)
app.mount("/evidence", StaticFiles(directory=str(captures_dir)), name="evidence")

# Background tasks via Celery (integrated in tasks)
app.celery_app = celery_app

# Health check
@app.get("/health")
def health():
    return {"status": "healthy"}