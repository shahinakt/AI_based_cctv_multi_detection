"""
backend/app/__init__.py - COMPLETE VERSION
Includes all routers and proper configuration
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
    ]
)
logger = logging.getLogger(__name__)
logger.info("🚀 Starting AI CCTV Backend...")

from .api.v1 import api_v1_router
from .api.v1 import auth, cameras, incidents, evidence, notifications, users, camera_status
from .core.config import settings
from .tasks.celery_app import celery_app


@asynccontextmanager
async def _app_lifespan(app_: FastAPI):
    """
    Application lifespan manager (replaces deprecated @app.on_event).
    Startup: DB health-check + SOS timer recovery for any incidents
    left unacknowledged when the server was last stopped.
    Shutdown: graceful cleanup logging.
    """
    # ── Startup ──────────────────────────────────────────────────────────────
    from sqlalchemy import text
    from datetime import datetime, timezone
    from .core.database import SessionLocal

    logger.info("🔥 Startup: checking DB connection...")
    _db = SessionLocal()
    try:
        _db.execute(text("SELECT 1"))
        print("✅ Database connection successful")
    except Exception as _e:
        print(f"❌ Database connection failed: {_e}")
    finally:
        _db.close()

    # SOS TIMER RECOVERY
    # Re-schedule (or immediately trigger) SOS for any high-priority incidents
    # that were left unacknowledged when the server last stopped.
    try:
        from .services.sos_service import (
            _timer_callback,
            SOS_TIMEOUT_SECONDS,
            _HIGH_SEVERITY,
        )
        from . import models

        _db2 = SessionLocal()
        try:
            _now = datetime.now(timezone.utc)
            _unhandled = (
                _db2.query(models.Incident)
                .filter(
                    models.Incident.acknowledged == False,
                    models.Incident.sos_triggered == False,
                    models.Incident.severity.in_(list(_HIGH_SEVERITY)),
                )
                .all()
            )

            _recovered = 0
            _immediate = 0
            for _incident in _unhandled:
                _ts = _incident.timestamp
                if _ts.tzinfo is None:
                    _ts = _ts.replace(tzinfo=timezone.utc)
                _elapsed = (_now - _ts).total_seconds()
                _remaining = SOS_TIMEOUT_SECONDS - _elapsed

                if _remaining > 0:
                    import threading
                    from .services.sos_service import _pending_timers, _lock
                    with _lock:
                        if _incident.id not in _pending_timers:
                            _t = threading.Timer(_remaining, _timer_callback, args=(_incident.id,))
                            _t.daemon = True
                            _t.name = f"sos-timer-{_incident.id}-recovered"
                            _t.start()
                            _pending_timers[_incident.id] = _t
                    _recovered += 1
                    logger.info(
                        "[Startup] ⏱ SOS timer RECOVERED for incident %d (%.0fs remaining)",
                        _incident.id, _remaining,
                    )
                else:
                    import threading
                    _t2 = threading.Thread(
                        target=_timer_callback,
                        args=(_incident.id,),
                        daemon=True,
                        name=f"sos-immediate-{_incident.id}",
                    )
                    _t2.start()
                    _immediate += 1
                    logger.warning(
                        "[Startup] 🚨 SOS IMMEDIATE trigger for incident %d (overdue by %.0fs)",
                        _incident.id, -_remaining,
                    )

            if _recovered or _immediate:
                logger.info(
                    "[Startup] SOS recovery: %d timers rescheduled, %d immediate triggers.",
                    _recovered, _immediate,
                )
            else:
                logger.info("[Startup] SOS recovery: no pending incidents found.")
        finally:
            _db2.close()

    except Exception as _sos_err:
        logger.warning("[Startup] SOS recovery skipped: %s", _sos_err)

    print("🚀 Backend API started successfully")

    yield  # ── application runs ─────────────────────────────────────────────

    # ── Shutdown ─────────────────────────────────────────────────────────────
    print("🛑 Backend API shutting down...")


# Create FastAPI app
app = FastAPI(
    title="AISURVEIL API",
    version="1.0.0",
    description="Real-time AI-powered surveillance system with dynamic camera management",
    lifespan=_app_lifespan,
    # Disable automatic trailing-slash redirects.
    # Without this, GET /api/v1/cameras -> 307 -> GET /api/v1/cameras/
    # and the redirected request may be swallowed by the StaticFiles
    # mount at "/" when the frontend dist folder exists.
    redirect_slashes=False,
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

# Mobile app development - Expo/React Native
allowed_origins.extend([
    "http://localhost:8081",
    "http://localhost:19000",
    "http://localhost:19006",
    "http://10.0.2.2:8081",  # Android emulator
])

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

logger.info(f"⚙️  CORS configured with {len(allowed_origins)} allowed origins")
logger.info(f"   Origins: {', '.join(allowed_origins[:5])}...")

app.add_middleware(
    CORSMiddleware,
    # IMPORTANT: When allow_credentials=True, '*' is NOT allowed.
    # Use the computed list of dev + configured origins.
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

logger.info("✅ CORS middleware configured")

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

# NOTE: stream_handler is already registered inside api_v1_router
# (prefix /api/v1/stream) via backend/app/api/v1/__init__.py.
# A second include_router here was creating duplicate endpoints and has
# been removed (issue B-1 from project audit).

# Camera stream proxy (safe, doesn't open webcams)
from .api.v1 import camera_stream
app.include_router(
    camera_stream.router, prefix="/api/v1", tags=["camera-stream"]
)

# ULTRA PROTECTION Evidence Security API
from .api.v1 import evidence_secure
app.include_router(
    evidence_secure.router, prefix="/api/v1/evidence-secure", tags=["evidence-secure"]
)
logger.info("✅ Evidence Secure (ULTRA PROTECTION) router registered at /api/v1/evidence-secure")

# Legacy top-level camera feed endpoint (supports `/camera_feed/{id}`)
from .api.v1 import camera_feed as camera_feed_module
app.include_router(camera_feed_module.router)

# ⚠️ DISABLED: Webcam streaming conflicts with AI Worker
# The AI Worker has exclusive access to the webcam for detection
# Backend should not try to open the camera directly
# app.include_router(
#     webcam_stream.router,
#     prefix="/api/v1/webcam",
#     tags=["webcam"]
# )

# ----- Background tasks -----
app.celery_app = celery_app

# ----- Health check -----
@app.get("/health", tags=["health"])
def health_check():
    """System health check"""
    logger.info("❤️  Health check requested")
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
# Evidence is now stored in ai_worker/data/captures
evidence_base = Path(__file__).resolve().parents[2] / "ai_worker" / "data" / "captures"
evidence_base.mkdir(parents=True, exist_ok=True)
logger.info(f"📁 Evidence directory: {evidence_base}")
logger.info(f"   Directory exists: {evidence_base.exists()}")

app.mount("/evidence", StaticFiles(directory=str(evidence_base)), name="evidence")
logger.info("✅ Evidence static files mounted at /evidence")

# ----- Serve frontend (optional) -----
frontend_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

# Startup / shutdown lifecycle is handled by _app_lifespan above,
# passed to FastAPI(lifespan=_app_lifespan). The deprecated
# @app.on_event decorators have been removed (issue B-4 from audit).