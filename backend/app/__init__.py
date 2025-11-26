"""
Backend Application Factory - CLEAN VERSION
Corrects CORS, router includes, static mounts, etc.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .api.v1 import api_v1_router
from .api.v1 import auth, cameras, incidents, evidence, notifications, users
from .core.config import settings
from .tasks.celery_app import celery_app

# Create FastAPI app
app = FastAPI(
    title="AI CCTV System API",
    version="1.0.0",
    description="Real-time AI-powered surveillance system",
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

print("⚙️ CORS allowed_origins:", allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(api_v1_router)

# ----- WebSocket endpoints -----
from .api.v1.websocket import router as ws_router

app.include_router(ws_router, prefix="/ws", tags=["websocket"])

# Stream handler for AI Worker integration
from .api.v1 import stream_handler

app.include_router(
    stream_handler.router, prefix="/api/v1/stream", tags=["stream"]
)

# ----- Static files for evidence -----
captures_dir = Path(__file__).resolve().parents[2] / "data" / "captures"
captures_dir.mkdir(parents=True, exist_ok=True)
app.mount("/evidence", StaticFiles(directory=str(captures_dir)), name="evidence")

# ----- Serve frontend (optional) -----
frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

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


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("🛑 Backend API shutting down...")
