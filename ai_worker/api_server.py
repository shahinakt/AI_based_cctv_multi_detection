"""
ai_worker/api_server.py - NEW FILE
FastAPI server for AI Worker to receive commands from backend
Handles dynamic camera start/stop and incident reporting
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Optional
import multiprocessing as mp
import logging

from ai_worker.inference.dynamic_camera_manager import CameraManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="AI Worker API", version="1.0.0")

# Global camera manager (singleton)
camera_manager: Optional[CameraManager] = None


@app.on_event("startup")
async def startup_event():
    """Initialize camera manager on startup"""
    global camera_manager
    camera_manager = CameraManager()
    logger.info("✅ AI Worker API Server started")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global camera_manager
    if camera_manager:
        camera_manager.stop_all_cameras()
    logger.info("🛑 AI Worker API Server stopped")


# Request/Response models
class CameraStartRequest(BaseModel):
    camera_id: int
    config: Dict


class CameraStopRequest(BaseModel):
    camera_id: int


class CameraStatusResponse(BaseModel):
    camera_id: int
    status: str
    fps: Optional[float] = None
    total_frames: Optional[int] = None
    error: Optional[str] = None


# API Endpoints
@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "active_cameras": len(camera_manager.active_cameras) if camera_manager else 0
    }


@app.post("/api/worker/cameras/start", response_model=CameraStatusResponse)
def start_camera(request: CameraStartRequest, background_tasks: BackgroundTasks):
    """
    Start processing a new camera
    Called by backend when user adds a camera
    """
    if not camera_manager:
        raise HTTPException(status_code=500, detail="Camera manager not initialized")
    
    try:
        # Check camera limit (only enforced when max_cameras > 0)
        if getattr(camera_manager, 'max_cameras', 0) and len(camera_manager.active_cameras) >= camera_manager.max_cameras:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {camera_manager.max_cameras} cameras already active. Stop a camera first."
            )

        # Start camera in background
        camera_manager.start_camera(request.camera_id, request.config)
        
        logger.info(f"✅ Camera {request.camera_id} starting...")
        
        return CameraStatusResponse(
            camera_id=request.camera_id,
            status="starting",
            fps=0.0,
            total_frames=0
        )
        
    except Exception as e:
        logger.error(f"Failed to start camera {request.camera_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/worker/cameras/stop", response_model=dict)
def stop_camera(request: CameraStopRequest):
    """
    Stop processing a camera
    Called by backend when user removes a camera
    """
    if not camera_manager:
        raise HTTPException(status_code=500, detail="Camera manager not initialized")
    
    try:
        success = camera_manager.stop_camera(request.camera_id)
        
        if success:
            logger.info(f"✅ Camera {request.camera_id} stopped")
            return {"msg": "Camera stopped successfully"}
        else:
            raise HTTPException(status_code=404, detail="Camera not found or already stopped")
            
    except Exception as e:
        logger.error(f"Failed to stop camera {request.camera_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/worker/cameras/status", response_model=Dict[int, CameraStatusResponse])
def get_all_camera_status():
    """Get status of all active cameras"""
    if not camera_manager:
        return {}
    
    statuses = {}
    for camera_id, worker_info in camera_manager.active_cameras.items():
        statuses[camera_id] = CameraStatusResponse(
            camera_id=camera_id,
            status=worker_info.get("status", "unknown"),
            fps=worker_info.get("fps", 0.0),
            total_frames=worker_info.get("total_frames", 0)
        )
    
    return statuses


@app.get("/api/worker/cameras/{camera_id}/status", response_model=CameraStatusResponse)
def get_camera_status(camera_id: int):
    """Get status of specific camera"""
    if not camera_manager:
        raise HTTPException(status_code=500, detail="Camera manager not initialized")
    
    worker_info = camera_manager.active_cameras.get(camera_id)
    
    if not worker_info:
        raise HTTPException(status_code=404, detail="Camera not active")
    
    return CameraStatusResponse(
        camera_id=camera_id,
        status=worker_info.get("status", "unknown"),
        fps=worker_info.get("fps", 0.0),
        total_frames=worker_info.get("total_frames", 0),
        error=worker_info.get("error")
    )


if __name__ == "__main__":
    import uvicorn
    
    # Set multiprocessing method
    mp.set_start_method('spawn', force=True)
    
    # Run server
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8765,  # Different port from backend
        reload=False,
        log_level="info"
    )