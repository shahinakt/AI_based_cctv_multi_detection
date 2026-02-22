"""
ai_worker/inference/multi_camera_worker.py - FIXED VERSION
Adds proper authentication for backend communication
"""

import multiprocessing as mp
import time
import logging
import os
import signal
from typing import Dict, Any, List

import requests
from ai_worker import config as worker_config

from ai_worker.inference.single_camera_worker import start_camera_process

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# ✅ FIXED: Add authentication headers
def _build_headers():
    """Build headers for backend requests with authentication"""
    headers = {}
    
    # Option 1: Use JWT token if available
    backend_api_key = worker_config.BACKEND_API_KEY
    if backend_api_key:
        headers["Authorization"] = f"Bearer {backend_api_key}"
    
    # Option 2: Use service key for AI worker authentication
    service_key = worker_config.AI_WORKER_SERVICE_KEY
    if service_key:
        headers["X-AI-Worker-Key"] = service_key
    
    return headers


def fetch_active_cameras() -> List[Dict[str, Any]]:
    """
    Fetch all enabled cameras from backend with authentication
    Fetches cameras with enabled=True (not just status="active")
    """
    try:
        url = f"{BACKEND_URL}/api/v1/cameras"
        # ✅ FIXED: Don't filter by status, fetch all enabled cameras
        # The backend will return cameras where enabled=True
        params = {}
        headers = _build_headers()
        
        logger.info(f"📡 Fetching cameras from backend: {url}")
        logger.info(f"📡 Using headers: {list(headers.keys())}")
        
        resp = requests.get(url, params=params, timeout=30, headers=headers)
        
        # ✅ FIXED: Better error handling
        if resp.status_code == 401:
            logger.error("❌ Authentication failed. Check BACKEND_API_KEY or AI_WORKER_SERVICE_KEY")
            logger.info("💡 Tip: Set environment variable: AI_WORKER_SERVICE_KEY='ai-worker-secret-key-change-in-production'")
            logger.info("💡 Or: BACKEND_API_KEY='your_jwt_token_here'")
            return []
        
        resp.raise_for_status()
        cameras = resp.json()

        if not isinstance(cameras, list):
            logger.warning("Unexpected cameras response format (expected list)")
            return []
        
        # Filter to only active cameras (is_active=True in database)
        active_cameras = [c for c in cameras if c.get('is_active', False)]
        
        logger.info(f"✅ Fetched {len(cameras)} cameras from backend ({len(active_cameras)} active)")
        
        if active_cameras:
            # Build camera list string without nested f-strings
            camera_list = [f"{c['id']}:{c.get('name', 'Unnamed')}" for c in active_cameras]
            logger.info(f"📋 Active cameras: {camera_list}")
        else:
            logger.warning("⚠️ No active cameras found. Cameras may be disabled or not properly created.")
            logger.warning("💡 Check backend /api/v1/cameras endpoint to see all cameras")
        
        return active_cameras

    except requests.exceptions.ConnectionError as e:
        logger.error(f"❌ Failed to connect to backend: {e}")
        logger.info("💡 Tip: Ensure backend is running at {BACKEND_URL}")
        return []
    except requests.exceptions.Timeout as e:
        logger.error(f"❌ Backend request timeout: {e}")
        return []
    except Exception as e:
        logger.error(f"❌ Failed to fetch cameras from backend: {e}")
        return []


def build_camera_config(camera: Dict[str, Any]) -> Dict[str, Any]:
    """
    Map backend camera JSON -> config dict for SingleCameraWorker
    """
    if "stream_url" in camera:
        stream_url = camera["stream_url"]
    else:
        stream_url = camera.get("rtsp_url")

    if stream_url is None:
        raise ValueError(f"Camera {camera.get('id')} has no stream_url field")

    width = camera.get("width", 640)
    height = camera.get("height", 480)

    device = (
        camera.get("processing_device")
        or camera.get("device")
        or os.getenv("AI_DEVICE", "cuda:0")
    )

    config = {
        "stream_url": stream_url,
        "name": camera.get("name", f"Camera_{camera.get('id')}"),
        "device": device,
        "resolution": (width, height),
        "process_every_n_frames": camera.get("process_every_n_frames", 1),
        "model_size": camera.get("model_size", "yolov8n.pt"),
    }

    return config


def start_all_cameras():
    """
    Start one process per active camera from backend with retry logic
    """
    logger.info("=" * 70)
    logger.info("🎥 AI-POWERED MULTI-CAMERA SURVEILLANCE SYSTEM")
    logger.info("=" * 70)
    
    # ✅ FIXED: Add retry mechanism for initial connection
    max_retries = 5
    retry_count = 0
    cameras = []
    
    while retry_count < max_retries and not cameras:
        cameras = fetch_active_cameras()
        
        if not cameras:
            retry_count += 1
            if retry_count < max_retries:
                wait_time = min(5 * retry_count, 30)  # Exponential backoff, max 30s
                logger.warning(f"⚠️ No cameras found, retrying in {wait_time}s... (attempt {retry_count}/{max_retries})")
                time.sleep(wait_time)
            else:
                logger.error("❌ Max retries reached. Falling back to static config.")

    # Fallback to static config if backend unavailable
    if not cameras:
        logger.warning("⚠️ No active cameras found in backend. Falling back to static config.")
        try:
            cameras = []
            next_auto_id = 0
            import re

            for cam_key, cam_cfg in worker_config.CAMERAS.items():
                m = re.search(r"(\d+)$", str(cam_key))
                if m:
                    numeric_id = int(m.group(1))
                else:
                    numeric_id = next_auto_id
                    next_auto_id += 1

                cam = {"id": numeric_id}
                cam["_key"] = cam_key
                cam.update(cam_cfg)
                cameras.append(cam)

            if not cameras:
                logger.warning("⚠️ No cameras defined in `ai_worker.config.CAMERAS`. Nothing to start.")
                return
            logger.info(f"✅ Loaded {len(cameras)} cameras from static config")
        except Exception as e:
            logger.error(f"❌ Failed to load static camera config: {e}")
            return

    processes: Dict[int, mp.Process] = {}

    for cam in cameras:
        camera_id = cam["id"]
        try:
            cfg = build_camera_config(cam)
        except Exception as e:
            logger.error(f"❌ Skipping camera {camera_id}: invalid config: {e}")
            continue

        logger.info(f"\n📹 Launching camera {camera_id}: {cfg['name']}")
        logger.info(f"   Device: {cfg['device']}")
        logger.info(f"   Resolution: {cfg['resolution']}")
        logger.info(f"   Process every: {cfg['process_every_n_frames']} frames")

        p = mp.Process(
            target=start_camera_process,
            args=(camera_id, cfg),
            name=f"camera_{camera_id}",
            daemon=True,
        )
        p.start()
        processes[camera_id] = p

        time.sleep(2)

    logger.info("\n" + "=" * 70)
    logger.info(f"✅ Started {len(processes)} camera processes")
    logger.info("Press Ctrl+C to stop all cameras")
    logger.info("=" * 70 + "\n")

    try:
        while True:
            time.sleep(5)

            # Monitor and restart dead processes
            for cam_id, proc in list(processes.items()):
                if not proc.is_alive():
                    logger.error(f"❌ Camera process {cam_id} died (exitcode={proc.exitcode})")
                    
                    # Auto-restart after 10 seconds
                    logger.info(f"🔄 Restarting camera {cam_id} in 10 seconds...")
                    time.sleep(10)
                    
                    try:
                        # Fetch fresh camera config
                        cameras = fetch_active_cameras()
                        cam = next((c for c in cameras if c["id"] == cam_id), None)
                        
                        if cam:
                            cfg = build_camera_config(cam)
                            new_p = mp.Process(
                                target=start_camera_process,
                                args=(cam_id, cfg),
                                name=f"camera_{cam_id}",
                                daemon=True,
                            )
                            new_p.start()
                            processes[cam_id] = new_p
                            logger.info(f"✅ Camera {cam_id} restarted")
                        else:
                            logger.warning(f"⚠️ Camera {cam_id} no longer active, not restarting")
                            del processes[cam_id]
                    except Exception as e:
                        logger.error(f"❌ Failed to restart camera {cam_id}: {e}")

    except KeyboardInterrupt:
        logger.info("\n\n⚠️ KeyboardInterrupt: stopping all cameras...")
        _stop_all_processes(processes)
        logger.info("✅ All camera processes stopped")


def _stop_all_processes(processes: Dict[int, mp.Process]):
    """Gracefully terminate all camera processes"""
    for cam_id, proc in processes.items():
        if not proc.is_alive():
            continue
        logger.info(f"   Stopping camera {cam_id} (pid={proc.pid})...")
        proc.terminate()
        proc.join(timeout=5)
        if proc.is_alive():
            logger.warning(f"   Camera {cam_id} did not exit, killing...")
            proc.kill()
    processes.clear()


if __name__ == "__main__":
    mp.set_start_method("spawn", force=True)
    start_all_cameras()
