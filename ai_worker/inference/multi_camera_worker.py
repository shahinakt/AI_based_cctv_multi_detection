"""
ai_worker/inference/multi_camera_worker.py

Multi-camera orchestration:
- Fetches camera list from backend
- Spawns one process per camera
- Uses SingleCameraWorker from single_camera_worker.py
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


# ---------------------------------------------------------------------------
# Helpers to talk to backend
# ---------------------------------------------------------------------------

def fetch_active_cameras() -> List[Dict[str, Any]]:
    """
    Fetch all active cameras from backend.

    Adjust the URL / query params to match your FastAPI API.
    Example: GET /api/v1/cameras?status=active
    """
    try:
        url = f"{BACKEND_URL}/api/v1/cameras"
        params = {"status": "active"}  # change if your API is different
        logger.info(f"📡 Fetching cameras from backend: {url} {params}")

        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        cameras = resp.json()

        if not isinstance(cameras, list):
            logger.warning("Unexpected cameras response format (expected list)")
            return []

        logger.info(f"✅ Fetched {len(cameras)} active cameras from backend")
        return cameras

    except Exception as e:
        logger.error(f"❌ Failed to fetch cameras from backend: {e}")
        return []


def build_camera_config(camera: Dict[str, Any]) -> Dict[str, Any]:
    """
    Map backend camera JSON -> config dict for SingleCameraWorker.

    You may need to adjust keys to match your Camera model.
    """
    # You MUST ensure these fields exist in your backend response:
    # - stream_url
    # - id
    # Optionally:
    # - name
    # - processing_device / device
    # - width, height
    # - process_every_n_frames
    stream_url = camera.get("stream_url") or camera.get("rtsp_url")
    if not stream_url:
        raise ValueError(f"Camera {camera.get('id')} has no stream_url field")

    width = camera.get("width", 640)
    height = camera.get("height", 480)

    # Pick device, fallback to CPU if not set
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


# ---------------------------------------------------------------------------
# Main multi-camera orchestration
# ---------------------------------------------------------------------------

def start_all_cameras():
    """
    Start one process per active camera from backend.
    This function is called by ai_worker.__main__ when mode=static/multi.
    """
    logger.info("=" * 70)
    logger.info("🎥 AI-POWERED MULTI-CAMERA SURVEILLANCE SYSTEM")
    logger.info("=" * 70)

    cameras = fetch_active_cameras()

    # Fallback: if backend unavailable or returned no cameras, use static config from ai_worker.config
    if not cameras:
        logger.warning("⚠️ No active cameras found in backend. Falling back to static config.")
        try:
            # `worker_config.CAMERAS` is a dict keyed by camera id
            cameras = []
            for cam_id, cam_cfg in worker_config.CAMERAS.items():
                cam = {'id': cam_id}
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
            daemon=True,  # will die when parent exits
        )
        p.start()
        processes[camera_id] = p

        # Stagger startup to avoid GPU/CPU spike
        time.sleep(2)

    logger.info("\n" + "=" * 70)
    logger.info(f"✅ Started {len(processes)} camera processes")
    logger.info("Press Ctrl+C to stop all cameras")
    logger.info("=" * 70 + "\n")

    try:
        # Keep main process alive, monitor children
        while True:
            time.sleep(5)

            # Optionally, we can restart dead processes here
            for cam_id, proc in list(processes.items()):
                if not proc.is_alive():
                    logger.error(f"❌ Camera process {cam_id} died (exitcode={proc.exitcode})")
                    # You can choose to restart it:
                    # new_p = mp.Process(...)
                    # new_p.start()
                    # processes[cam_id] = new_p

    except KeyboardInterrupt:
        logger.info("\n\n⚠️ KeyboardInterrupt: stopping all cameras...")
        _stop_all_processes(processes)
        logger.info("✅ All camera processes stopped")


def _stop_all_processes(processes: Dict[int, mp.Process]):
    """Gracefully terminate all camera processes."""
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
    # Important for CUDA + Windows
    mp.set_start_method("spawn", force=True)
    start_all_cameras()
