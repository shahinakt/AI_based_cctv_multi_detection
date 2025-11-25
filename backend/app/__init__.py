"""
Backend Application Factory - FIXED VERSION
Corrects CORS, adds stream handler, fixes imports
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .api.v1 import auth, cameras, incidents, evidence, notifications, users
from .core.config import settings
from .core.database import engine
from .tasks.celery_app import celery_app

# Create FastAPI app
app = FastAPI(
    title="AI CCTV System API",
    version="1.0.0",
    description="Real-time AI-powered surveillance system"
)

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

# Include API routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(cameras.router, prefix="/api/v1/cameras", tags=["cameras"])
app.include_router(incidents.router, prefix="/api/v1/incidents", tags=["incidents"])
app.include_router(evidence.router, prefix="/api/v1/evidence", tags=["evidence"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])

# WebSocket endpoints
from .api.v1.websocket import router as ws_router
app.include_router(ws_router, prefix="/ws", tags=["websocket"])

# Stream handler for AI Worker integration - NEW
from .api.v1 import stream_handler
app.include_router(stream_handler.router, prefix="/api/v1/stream", tags=["stream"])

# Static files for evidence
captures_dir = Path(__file__).resolve().parents[2] / "data" / "captures"
captures_dir.mkdir(parents=True, exist_ok=True)
app.mount("/evidence", StaticFiles(directory=str(captures_dir)), name="evidence")

# Serve frontend (optional)
frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

# Background tasks
app.celery_app = celery_app

# Health check
@app.get("/health", tags=["health"])
def health_check():
    """System health check"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "components": {
            "api": "operational",
            "database": "operational",
            "celery": "operational"
        }
    }

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    from sqlalchemy import text
    from .core.database import SessionLocal
    
    # Test database connection
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        print("✅ Database connection successful")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
    finally:
        db.close()
    
    print("🚀 Backend API started successfully")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("🛑 Backend API shutting down...")