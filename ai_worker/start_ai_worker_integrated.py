"""
Complete AI Worker Startup with Backend Integration
Run this to start the full AI worker system that integrates with backend
"""
import sys
import os
import logging
import multiprocessing as mp
import uvicorn

# Add project root to path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def start_api_server():
    """
    Start FastAPI server for backend communication
    This handles:
    - POST /api/worker/cameras/start - Start camera processing
    - POST /api/worker/cameras/stop - Stop camera processing
    - GET /api/worker/cameras/status - Get camera status
    """
    logger.info("🚀 Starting AI Worker API Server on port 8765")
    
    # Import here to avoid circular imports
    from ai_worker.api_server import app
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8765,
        log_level="info",
        access_log=True
    )


def start_camera_monitor():
    """
    Start camera monitor that fetches cameras from backend
    and keeps them processing
    """
    import time
    import requests
    from ai_worker.inference.dynamic_camera_manager import get_camera_manager
    
    logger.info("📡 Starting Camera Monitor")
    
    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
    camera_manager = get_camera_manager()
    
    while True:
        try:
            # Fetch active cameras from backend
            resp = requests.get(f"{BACKEND_URL}/api/v1/cameras", timeout=10)
            if resp.status_code == 200:
                cameras = resp.json()
                
                active_camera_ids = {cam['id'] for cam in cameras if cam.get('is_active')}
                current_camera_ids = set(camera_manager.active_cameras.keys())
                
                # Start new cameras
                for cam in cameras:
                    if cam.get('is_active') and cam['id'] not in current_camera_ids:
                        logger.info(f"📹 Auto-starting camera {cam['id']}: {cam['name']}")
                        
                        config = {
                            'stream_url': cam['stream_url'],
                            'name': cam['name'],
                            'device': 'cuda:0',
                            'resolution': (640, 480),
                            'process_every_n_frames': 1,
                            'enable_incidents': True
                        }
                        
                        try:
                            camera_manager.start_camera(cam['id'], config)
                        except Exception as e:
                            logger.error(f"Failed to start camera {cam['id']}: {e}")
                
                # Stop removed cameras
                for cam_id in current_camera_ids:
                    if cam_id not in active_camera_ids:
                        logger.info(f"🛑 Auto-stopping camera {cam_id}")
                        camera_manager.stop_camera(cam_id)
            
        except Exception as e:
            logger.error(f"Camera monitor error: {e}")
        
        # Check every 30 seconds
        time.sleep(30)


if __name__ == "__main__":
    # Set multiprocessing start method
    try:
        mp.set_start_method('spawn', force=True)
    except RuntimeError:
        pass
    
    logger.info("=" * 70)
    logger.info("🚀 AI WORKER - FULL INTEGRATION MODE")
    logger.info("=" * 70)
    logger.info("Starting services:")
    logger.info("  1. API Server (port 8765) - Backend communication")
    logger.info("  2. Camera Monitor - Auto-start/stop cameras")
    logger.info("=" * 70)
    
    # Start API server in separate process
    api_process = mp.Process(
        target=start_api_server,
        name="AIWorkerAPI",
        daemon=True
    )
    api_process.start()
    logger.info("✅ API Server started (PID: {})".format(api_process.pid))
    
    # Start camera monitor in separate process
    monitor_process = mp.Process(
        target=start_camera_monitor,
        name="CameraMonitor",
        daemon=True
    )
    monitor_process.start()
    logger.info("✅ Camera Monitor started (PID: {})".format(monitor_process.pid))
    
    logger.info("=" * 70)
    logger.info("✅ AI Worker System Running")
    logger.info("   API Server: http://0.0.0.0:8765")
    logger.info("   Health Check: http://0.0.0.0:8765/health")
    logger.info("Press Ctrl+C to stop")
    logger.info("=" * 70)
    
    try:
        # Keep main process alive
        api_process.join()
    except KeyboardInterrupt:
        logger.info("\n⚠️ Shutting down AI Worker...")
        
        api_process.terminate()
        monitor_process.terminate()
        
        api_process.join(timeout=5)
        monitor_process.join(timeout=5)
        
        if api_process.is_alive():
            api_process.kill()
        if monitor_process.is_alive():
            monitor_process.kill()
        
        logger.info("✅ AI Worker stopped")