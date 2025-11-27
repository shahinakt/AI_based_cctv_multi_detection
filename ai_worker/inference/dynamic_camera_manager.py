"""
ai_worker/inference/dynamic_camera_manager.py - NEW FILE
Manages multiple cameras dynamically (start/stop on demand)
Maximum 4 concurrent cameras, supports GPU/CPU optimization
"""
import multiprocessing as mp
import logging
from typing import Dict
import time

from ai_worker.inference.single_camera_worker import SingleCameraWorker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CameraManager:
    """
    Dynamic camera manager
    Starts/stops camera workers on demand
    Enforces 4-camera limit
    """
    
    def __init__(self):
        self.active_cameras: Dict[int, dict] = {}
        self.max_cameras = 4
        
        logger.info("🎥 Camera Manager initialized (max 4 cameras)")
    
    def start_camera(self, camera_id: int, config: dict):
        """
        Start processing a new camera
        
        Args:
            camera_id: Unique camera identifier
            config: Camera configuration dict with:
                - stream_url: RTSP URL or webcam ID
                - name: Camera name
                - location: Physical location
                - device: 'cuda:0' or 'cpu' (manager will optimize)
                - resolution: (width, height)
                - process_every_n_frames: Frame skip
                - enable_incidents: Enable incident detection
        """
        # Check if already running
        if camera_id in self.active_cameras:
            logger.warning(f"⚠️ Camera {camera_id} is already running")
            return
        
        # Check limit
        if len(self.active_cameras) >= self.max_cameras:
            raise Exception(f"Maximum {self.max_cameras} cameras already active")
        
        # Optimize device assignment
        config['device'] = self._assign_optimal_device()
        
        logger.info(f"🚀 Starting camera {camera_id} on {config['device']}")
        
        # Create worker process
        process = mp.Process(
            target=self._run_camera_worker,
            args=(camera_id, config),
            name=f"Camera_{camera_id}"
        )
        process.start()
        
        # Track camera
        self.active_cameras[camera_id] = {
            'process': process,
            'config': config,
            'status': 'running',
            'started_at': time.time(),
            'fps': 0.0,
            'total_frames': 0,
            'total_incidents': 0
        }
        
        logger.info(f"✅ Camera {camera_id} started successfully")
    
    def stop_camera(self, camera_id: int) -> bool:
        """
        Stop processing a camera
        
        Args:
            camera_id: Camera to stop
            
        Returns:
            True if stopped successfully
        """
        if camera_id not in self.active_cameras:
            logger.warning(f"⚠️ Camera {camera_id} not found in active cameras")
            return False
        
        logger.info(f"🛑 Stopping camera {camera_id}...")
        
        camera_info = self.active_cameras[camera_id]
        process = camera_info['process']
        
        # Graceful shutdown
        if process.is_alive():
            process.terminate()
            process.join(timeout=5)
            
            # Force kill if still alive
            if process.is_alive():
                process.kill()
                process.join()
        
        # Remove from tracking
        del self.active_cameras[camera_id]
        
        logger.info(f"✅ Camera {camera_id} stopped")
        return True
    
    def stop_all_cameras(self):
        """Stop all active cameras"""
        logger.info("🛑 Stopping all cameras...")
        
        camera_ids = list(self.active_cameras.keys())
        for camera_id in camera_ids:
            self.stop_camera(camera_id)
        
        logger.info("✅ All cameras stopped")
    
    def get_camera_status(self, camera_id: int) -> dict:
        """Get status of specific camera"""
        return self.active_cameras.get(camera_id, {})
    
    def _assign_optimal_device(self) -> str:
        """
        Assign optimal GPU/CPU device based on current load
        Strategy:
        - First camera: GPU (cuda:0)
        - Additional cameras: CPU to avoid GPU overload
        
        Returns:
            'cuda:0' or 'cpu'
        """
        import torch
        
        if not torch.cuda.is_available():
            return 'cpu'
        
        # Count GPU cameras
        gpu_count = sum(
            1 for cam in self.active_cameras.values()
            if cam['config'].get('device', '').startswith('cuda')
        )
        
        # Allow only 1 camera on GPU for 2GB VRAM
        if gpu_count >= 1:
            logger.info("GPU already in use, assigning new camera to CPU")
            return 'cpu'
        else:
            logger.info("GPU available, assigning new camera to GPU")
            return 'cuda:0'
    
    def _run_camera_worker(self, camera_id: int, config: dict):
        """
        Run camera worker in separate process
        This function is executed in a child process
        """
        try:
            # Create worker
            worker = SingleCameraWorker(camera_id, config)
            
            # Run processing loop
            worker.run()
            
        except KeyboardInterrupt:
            logger.info(f"Camera {camera_id} interrupted by user")
        except Exception as e:
            logger.error(f"Camera {camera_id} worker crashed: {e}")
            
            # Update status in shared memory (if implemented)
            # For now, process will just terminate


# Singleton instance for API server
_camera_manager = None

def get_camera_manager() -> CameraManager:
    """Get singleton camera manager instance"""
    global _camera_manager
    if _camera_manager is None:
        _camera_manager = CameraManager()
    return _camera_manager