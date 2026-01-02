"""
backend/app/__init__.py - COMPLETE VERSION
Includes all routers and proper configuration
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .api.v1 import webcam_stream
from .api.v1 import api_v1_router
from .api.v1 import auth, cameras, incidents, evidence, notifications, users, camera_status
from .core.config import settings
from .tasks.celery_app import celery_app

# Create FastAPI app
app = FastAPI(
    title="AI CCTV Hybrid Multi Detection API",
    version="1.0.0",
    description="Real-time AI-powered surveillance system with dynamic camera management",
)

# ----- CORS -----
frontend_origins = [
    origin.strip()
    for origin in settings.FRONTEND_URL.split(",")
    if origin.strip()
]

allowed_origins = frontend_origins.copy()
if settings.MOBILE_URL:
    allowed_origins.append(settings.MOBILE_URL.strip())

# Add AI Worker origin
allowed_origins.append("http://localhost:8765")

# During local frontend/mobile development many dev servers run on various ports
# (Vite/3000, React Native web/Expo on 8081/19006, etc). Include common dev
# origins so browser requests from the dev server don't get blocked by CORS.
dev_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # React Native web / Expo (Metro) default web port
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    # Expo web/DevTools common ports
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "http://localhost:19000",
    "http://127.0.0.1:19000",
]
for o in dev_origins:
    if o not in allowed_origins:
        allowed_origins.append(o)

print("⚙️ CORS allowed_origins:", allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include main API router
app.include_router(api_v1_router)

# ALSO expose legacy top-level camera routes for older clients
# This mounts the same cameras router at `/cameras` (no /api/v1 prefix)
from .api.v1 import cameras as cameras_router_module
app.include_router(cameras_router_module.router, prefix="/cameras", tags=["cameras_legacy"])

# NOTE: `camera_status` router is already included inside `api_v1_router`
# in `backend/app/api/v1/__init__.py` under the `/api/v1/cameras` prefix.
# Including it again here caused duplicate route registrations which
# prevented the FastAPI app from starting and resulted in frontend
# "Network Error" when the dashboard attempted to load cameras.
# Therefore, DO NOT re-include it here to avoid duplicate endpoints.

# ----- WebSocket endpoints -----
from .api.v1.websocket import router as ws_router
app.include_router(ws_router, prefix="/ws", tags=["websocket"])

# Stream handler for AI Worker integration
from .api.v1 import stream_handler
app.include_router(
    stream_handler.router, prefix="/api/v1/stream", tags=["stream"]
)

# Legacy top-level camera feed endpoint (supports `/camera_feed/{id}`)
from .api.v1 import camera_feed as camera_feed_module
app.include_router(camera_feed_module.router)

app.include_router(
    webcam_stream.router,
    prefix="/api/v1/webcam",
    tags=["webcam"]
)

# ----- Background tasks -----
app.celery_app = celery_app

# ----- Health check -----
@app.get("/health", tags=["health"])
def health_check():
    """System health check"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "components": {
            "api": "operational",
            "database": "operational",
            "celery": "operational",
        },
    }

# ----- Static files for evidence -----
evidence_base = Path(__file__).resolve().parents[2] / "data" / "captures"
evidence_base.mkdir(parents=True, exist_ok=True)
app.mount("/evidence", StaticFiles(directory=str(evidence_base)), name="evidence")

# ----- Serve frontend (optional) -----
frontend_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

# ----- Startup / Shutdown events -----
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    from sqlalchemy import text
    from .core.database import SessionLocal

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        print("✅ Database connection successful")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
    finally:
        db.close()

    print("🚀 Backend API started successfully")
    print(f"   Evidence directory: {evidence_base}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("🛑 Backend API shutting down...")