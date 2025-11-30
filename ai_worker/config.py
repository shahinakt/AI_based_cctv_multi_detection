"""
ai_worker/config.py - FIXED VERSION
Adds proper authentication and evidence path configuration
"""
import os
import torch
import logging
import psutil
import requests
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# GPU/CPU DEVICE CONFIGURATION WITH DYNAMIC MONITORING
# ============================================================================

class GPUMonitor:
    """Real-time GPU monitoring and throttling"""
    
    def __init__(self):
        self.gpu_available = torch.cuda.is_available()
        self.warnings_sent = set()
        
    def get_gpu_status(self) -> dict:
        """Get current GPU status"""
        if not self.gpu_available:
            return {
                'available': False,
                'temperature': None,
                'memory_allocated': 0,
                'memory_cached': 0,
                'memory_total': 0,
                'utilization': 0
            }
        
        try:
            return {
                'available': True,
                'temperature': self._get_temperature(),
                'memory_allocated': torch.cuda.memory_allocated(0) / 1024**3,
                'memory_cached': torch.cuda.memory_reserved(0) / 1024**3,
                'memory_total': torch.cuda.get_device_properties(0).total_memory / 1024**3,
                'utilization': self._get_utilization()
            }
        except Exception as e:
            logger.error(f"Error getting GPU status: {e}")
            return {}
    
    def _get_temperature(self) -> Optional[float]:
        """Get GPU temperature (NVIDIA only)"""
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            pynvml.nvmlShutdown()
            return temp
        except:
            return None
    
    def _get_utilization(self) -> float:
        """Get GPU utilization percentage"""
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            pynvml.nvmlShutdown()
            return util.gpu
        except:
            return 0.0
    
    def should_throttle(self) -> tuple[bool, str]:
        """Check if processing should be throttled"""
        status = self.get_gpu_status()

        if not status.get('available'):
            return False, ""

        if status.get('temperature') is not None:
            if status['temperature'] > 85:
                return True, f"GPU temperature critical: {status['temperature']}°C"
            elif status['temperature'] > 80:
                if 'temp_warning' not in self.warnings_sent:
                    logger.warning(f"⚠️ GPU temperature high: {status['temperature']}°C")
                    self.warnings_sent.add('temp_warning')
        
        mem_total = status.get('memory_total') or 0.0
        if mem_total > 0:
            mem_usage = status.get('memory_allocated', 0.0) / mem_total
        else:
            mem_usage = 0.0

        if mem_usage > 0.95:
            return True, f"GPU memory critical: {mem_usage*100:.1f}%"
        elif mem_usage > 0.90:
            if 'mem_warning' not in self.warnings_sent:
                logger.warning(f"⚠️ GPU memory high: {mem_usage*100:.1f}%")
                self.warnings_sent.add('mem_warning')
        
        return False, ""
    
    def clear_cache_if_needed(self):
        """Clear GPU cache if memory usage is high"""
        if not self.gpu_available:
            return
        
        status = self.get_gpu_status()
        mem_total = status.get('memory_total') or 0.0
        if mem_total <= 0:
            return

        mem_usage = status.get('memory_allocated', 0.0) / mem_total
        
        if mem_usage > 0.85:
            torch.cuda.empty_cache()
            logger.info("🧹 GPU cache cleared due to high memory usage")


gpu_monitor = GPUMonitor()

DEVICE_GPU = 'cuda:0' if torch.cuda.is_available() else 'cpu'
DEVICE_CPU = 'cpu'

if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
    logger.info(f"✅ GPU Available: {gpu_name} ({gpu_memory:.2f} GB)")
    logger.info(f"   GPU Device: {DEVICE_GPU}")
else:
    logger.warning("⚠️ No GPU detected, using CPU only")

logger.info(f"   CPU Device: {DEVICE_CPU}")

# ============================================================================
# CAMERA CONFIGURATION (Multi-Camera Setup)
# ============================================================================

CAMERAS = {
    'camera0': {
        'stream_url': 0,
        'device': DEVICE_GPU,
        'model_size': 'yolov8n.pt',
        'resolution': (640, 480),
        'process_every_n_frames': 1,
        'priority': 'high',
        'description': 'Main Entrance',
        'enable_incidents': True,
        'enable_pose': False,
    }
}

# ============================================================================
# MODEL PATHS
# ============================================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
MODEL_DIR = os.path.join(PROJECT_ROOT, 'models')
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')

# ✅ FIXED: Use absolute path and ensure it matches backend's evidence directory
EVIDENCE_DIR = os.getenv(
    'EVIDENCE_DIR',
    os.path.abspath(os.path.join(PROJECT_ROOT, '..', 'data', 'captures'))
)

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(EVIDENCE_DIR, exist_ok=True)

logger.info(f"📁 Evidence directory: {EVIDENCE_DIR}")

YOLO_MODEL_PATH = os.path.join(MODEL_DIR, 'yolov8n.pt')
POSE_MODEL_PATH = os.path.join(MODEL_DIR, 'pose_model.pth')
BEHAVIOR_MODEL_PATH = os.path.join(MODEL_DIR, 'behavior_model.pth')

# ============================================================================
# GPU MEMORY MANAGEMENT
# ============================================================================

TORCH_GPU_MEMORY_FRACTION = 0.8

if torch.cuda.is_available():
    try:
        torch.cuda.set_per_process_memory_fraction(TORCH_GPU_MEMORY_FRACTION, 0)
        logger.info(f"✅ GPU memory limit set to {TORCH_GPU_MEMORY_FRACTION*100}%")
    except Exception as e:
        logger.warning(f"⚠️ Could not set GPU memory limit: {e}")

BATCH_SIZE = 1

if torch.cuda.is_available():
    torch.cuda.empty_cache()
    logger.info("✅ GPU cache cleared")

# ============================================================================
# DETECTION SETTINGS
# ============================================================================

YOLO_CONFIDENCE_THRESHOLD = 0.5
YOLO_IOU_THRESHOLD = 0.45
YOLO_MAX_DETECTIONS = 100

DETECTION_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck',
    'backpack', 'handbag', 'suitcase', 'laptop', 'cell phone'
]

VALUABLE_OBJECTS = ['backpack', 'handbag', 'suitcase', 'laptop', 'cell phone']

# ============================================================================
# INCIDENT DETECTION SETTINGS
# ============================================================================

INCIDENT_COOLDOWN = 5.0
FALL_ASPECT_RATIO_THRESHOLD = 0.7
FALL_CONFIDENCE_MIN = 0.5
VIOLENCE_PROXIMITY_THRESHOLD = 50
VIOLENCE_MIN_PEOPLE = 2
THEFT_PROXIMITY_THRESHOLD = 100
THEFT_CONFIDENCE = 0.6
LOITERING_FRAME_THRESHOLD = 30
HEALTH_EMERGENCY_FRAME_THRESHOLD = 10
HEALTH_EMERGENCY_GROUND_THRESHOLD = 0.7

RESTRICTED_ZONES = {
    'camera0': {
        'enabled': True,
        'zones': [
            {'x_min': 0.7, 'x_max': 1.0, 'y_min': 0.7, 'y_max': 1.0, 'name': 'Restricted Area'}
        ]
    },
}

# ============================================================================
# BACKEND API CONFIGURATION - ✅ FIXED
# ============================================================================

BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')

# ✅ NEW: API key for authentication with backend
BACKEND_API_KEY = os.getenv('BACKEND_API_KEY', '')

# ✅ NEW: AI Worker service key (backend validates this)
AI_WORKER_SERVICE_KEY = os.getenv('AI_WORKER_SERVICE_KEY', 'ai-worker-secret-key-change-in-production')

API_ENDPOINTS = {
    'incidents': f'{BACKEND_URL}/api/v1/incidents',
    'evidence': f'{BACKEND_URL}/api/v1/evidence',
    'cameras': f'{BACKEND_URL}/api/v1/cameras',
    'alerts': f'{BACKEND_URL}/api/v1/alerts',
    'stream': f'{BACKEND_URL}/ws/stream',
}

API_TIMEOUT = 5

# ============================================================================
# STREAMING CONFIGURATION
# ============================================================================

STREAM_SERVER_HOST = '0.0.0.0'
STREAM_SERVER_PORT = 8765
STREAM_MAX_FPS = 30
STREAM_QUALITY = 80

# ============================================================================
# EVIDENCE STORAGE
# ============================================================================

SAVE_EVIDENCE_LOCALLY = True
EVIDENCE_RETENTION_DAYS = 30
SAVE_SNAPSHOTS = True
SNAPSHOT_QUALITY = 90
SAVE_VIDEO_CLIPS = True
VIDEO_CLIP_DURATION = 10
VIDEO_CLIP_FPS = 15
VIDEO_CODEC = 'mp4v'
PRE_EVENT_BUFFER_FRAMES = 30

# ============================================================================
# PERFORMANCE MONITORING
# ============================================================================

LOG_FPS_INTERVAL = 30
MONITOR_GPU_MEMORY = True
GPU_MEMORY_WARNING_THRESHOLD = 0.9

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================

LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

# ============================================================================
# MULTIPROCESSING SETTINGS
# ============================================================================

MP_START_METHOD = 'spawn'
NUM_WORKERS = len(CAMERAS)

# ============================================================================
# SAFETY SETTINGS
# ============================================================================

GPU_TEMP_WARNING = 80
GPU_TEMP_CRITICAL = 85
ENABLE_AUTO_THROTTLE = True
THROTTLE_ON_HIGH_TEMP = True
THROTTLE_ON_HIGH_MEMORY = True

EMERGENCY_STOP_CONDITIONS = {
    'gpu_temp': 90,
    'gpu_memory': 0.95,
    'consecutive_errors': 10
}

config = {
    'enable_smart_theft': True,
    'enable_smart_fall': True,
    'theft_cooldown': 10.0,
    'fall_cooldown': 10.0,
}

# ============================================================================
# FEATURE FLAGS
# ============================================================================

FEATURES = {
    'pose_estimation': False,
    'behavior_classification': False,
    'object_tracking': False,
    'incident_detection': True,
    'blockchain_evidence': False,
    'cloud_sync': False,
    'stream_processing': True,
}

# ============================================================================
# VALIDATION
# ============================================================================

def validate_config():
    """Validate configuration and warn about potential issues"""
    warnings = []
    
    if torch.cuda.is_available():
        gpu_cameras = sum(1 for cam in CAMERAS.values() if cam['device'].startswith('cuda'))
        if gpu_cameras > 1:
            warnings.append(
                f"⚠️ Warning: {gpu_cameras} cameras assigned to GPU with only 2GB VRAM. "
                "This may cause out-of-memory errors. Consider using CPU for additional cameras."
            )
    
    # ✅ NEW: Validate evidence directory is accessible
    if not os.path.exists(EVIDENCE_DIR):
        warnings.append(f"⚠️ Warning: Evidence directory does not exist: {EVIDENCE_DIR}")
    elif not os.access(EVIDENCE_DIR, os.W_OK):
        warnings.append(f"⚠️ Warning: Evidence directory is not writable: {EVIDENCE_DIR}")
    
    # ✅ NEW: Warn if API key is missing
    if not BACKEND_API_KEY and not AI_WORKER_SERVICE_KEY:
        warnings.append("⚠️ Warning: No authentication configured for backend communication")
    
    for cam_id, config_cam in CAMERAS.items():
        if isinstance(config_cam['stream_url'], str) and config_cam['stream_url'].startswith('rtsp'):
            logger.info(f"📹 {cam_id}: RTSP stream configured")
    
    for warning in warnings:
        logger.warning(warning)
    
    return len(warnings) == 0

validate_config()

# ============================================================================
# SUMMARY
# ============================================================================

logger.info("=" * 70)
logger.info("📋 CONFIGURATION SUMMARY")
logger.info("=" * 70)
logger.info(f"GPU Device: {DEVICE_GPU}")
logger.info(f"Number of Cameras: {len(CAMERAS)}")
logger.info(f"GPU Cameras: {sum(1 for c in CAMERAS.values() if c['device'].startswith('cuda'))}")
logger.info(f"CPU Cameras: {sum(1 for c in CAMERAS.values() if c['device'] == 'cpu')}")
logger.info(f"Backend URL: {BACKEND_URL}")
logger.info(f"Stream Server: {STREAM_SERVER_HOST}:{STREAM_SERVER_PORT}")
logger.info(f"Evidence Directory: {EVIDENCE_DIR}")
logger.info(f"Authentication: {'Configured' if (BACKEND_API_KEY or AI_WORKER_SERVICE_KEY) else 'MISSING'}")
logger.info("=" * 70)
