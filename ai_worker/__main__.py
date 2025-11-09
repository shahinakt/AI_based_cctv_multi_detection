"""
AI Worker Entry Point - FIXED VERSION
Corrects import paths and adds proper error handling
"""
import sys
import os
import logging
import multiprocessing as mp

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from ai_worker.models import yolo_detector, pose_estimator, behavior_classifier, tracker
from ai_worker.inference.multi_camera_worker import start_all_cameras
from ai_worker.inference.stream_worker import start_stream_server
from ai_worker.config_manager import get_config_manager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def start_ai_worker(mode: str = 'static', enable_streams: bool = True):
    """
    Start AI Worker with proper initialization
    
    Args:
        mode: 'static' (config.py) or 'dynamic' (database)
        enable_streams: Enable WebSocket stream processing
    """
    logger.info("🚀 Starting AI Worker System")
    logger.info("=" * 70)
    
    # Set multiprocessing start method
    try:
        mp.set_start_method('spawn', force=True)
    except RuntimeError:
        logger.warning("Multiprocessing start method already set")
    
    # Load models (optional pre-initialization)
    try:
        logger.info("🧠 Pre-loading AI models...")
        
        # Check if models have load_model method
        if hasattr(yolo_detector, "load_model"):
            yolo_detector.load_model()
            logger.info("✅ YOLO detector pre-loaded")
        
        if hasattr(pose_estimator, "load_model"):
            pose_estimator.load_model()
            logger.info("✅ Pose estimator pre-loaded")
        
        if hasattr(behavior_classifier, "load_model"):
            behavior_classifier.load_model()
            logger.info("✅ Behavior classifier pre-loaded")
        
        if hasattr(tracker, "initialize"):
            tracker.initialize()
            logger.info("✅ Object tracker initialized")
            
    except Exception as e:
        logger.warning(f"⚠️ Model pre-loading failed (will load per-worker): {e}")
    
    # Dynamic configuration mode
    if mode == 'dynamic':
        logger.info("📊 Mode: Dynamic (Database-driven)")
        config_manager = get_config_manager()
        if not config_manager.connect_db():
            logger.error("❌ Failed to connect to database, falling back to static mode")
            mode = 'static'
    else:
        logger.info("📋 Mode: Static (config.py)")
    
    # Start camera workers
    camera_process = mp.Process(
        target=start_all_cameras,
        name='CameraWorkers'
    )
    camera_process.start()
    logger.info("✅ Camera workers started")
    
    # Start stream server for dynamic inputs
    stream_process = None
    if enable_streams:
        stream_process = mp.Process(
            target=start_stream_server,
            args=('0.0.0.0', 8765),
            name='StreamServer'
        )
        stream_process.start()
        logger.info("🌊 Stream server started on port 8765")
    
    logger.info("=" * 70)
    logger.info("✅ AI Worker System Running")
    logger.info("   Camera Workers: Active")
    if enable_streams:
        logger.info("   Stream Server: ws://0.0.0.0:8765")
    logger.info("Press Ctrl+C to stop")
    logger.info("=" * 70)
    
    # Wait for processes
    try:
        camera_process.join()
        if stream_process:
            stream_process.join()
    except KeyboardInterrupt:
        logger.info("\n⚠️ Shutting down AI Worker...")
        
        camera_process.terminate()
        if stream_process:
            stream_process.terminate()
        
        camera_process.join(timeout=5)
        if stream_process:
            stream_process.join(timeout=5)
        
        # Force kill if still alive
        if camera_process.is_alive():
            camera_process.kill()
        if stream_process and stream_process.is_alive():
            stream_process.kill()
            
        logger.info("✅ AI Worker stopped")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='AI Worker for CCTV Surveillance')
    parser.add_argument(
        '--mode',
        choices=['static', 'dynamic'],
        default='static',
        help='Configuration mode'
    )
    parser.add_argument(
        '--no-streams',
        action='store_true',
        help='Disable WebSocket stream processing'
    )
    
    args = parser.parse_args()
    
    start_ai_worker(mode=args.mode, enable_streams=not args.no_streams)