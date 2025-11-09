
import os
import torch
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# GPU/CPU DEVICE CONFIGURATION
# ============================================================================

# Detect available devices
DEVICE_GPU = 'cuda:0' if torch.cuda.is_available() else 'cpu'
DEVICE_CPU = 'cpu'

# Log device configuration
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
    # CAMERA 0: Main entrance (highest priority, GPU processing)
    'camera0': {
        'stream_url': 0,              # Webcam ID or RTSP URL
        'device': DEVICE_GPU,         # Use GPU for main camera
        'model_size': 'yolov8n.pt',   # Nano model (fastest for 2GB VRAM)
        'resolution': (640, 480),     # Standard resolution
        'process_every_n_frames': 1,  # Process every frame (real-time)
        'priority': 'high',
        'description': 'Main Entrance',
        'enable_incidents': True,     # Enable incident detection
        'enable_pose': False,         # Disable pose to save resources
    },
    
    # CAMERA 1: Parking area (medium priority, CPU processing)
    'camera1': {
        'stream_url': 1,              # Second webcam or RTSP
        'device': DEVICE_CPU,         # Use CPU
        'model_size': 'yolov8n.pt',
        'resolution': (640, 480),
        'process_every_n_frames': 2,  # Process every 2nd frame
        'priority': 'medium',
        'description': 'Parking Area',
        'enable_incidents': True,
        'enable_pose': False,
    },
    
    # CAMERA 2: Back door (low priority, CPU processing)
    'camera2': {
        'stream_url': 2,              # Third webcam or RTSP
        'device': DEVICE_CPU,         # Use CPU
        'model_size': 'yolov8n.pt',
        'resolution': (480, 360),     # Lower resolution to reduce CPU load
        'process_every_n_frames': 3,  # Process every 3rd frame
        'priority': 'low',
        'description': 'Back Door',
        'enable_incidents': True,
        'enable_pose': False,
    },

    # CAMERA 3: Storage room (lowest priority, CPU processing)
    'camera3': {
    'stream_url': 3,  # or RTSP URL
    'device': DEVICE_CPU,
    'model_size': 'yolov8n.pt',
    'resolution': (480, 360),
    'process_every_n_frames': 4,
    'priority': 'low',
    'description': 'Storage Room',
    'enable_incidents': True,
    'enable_pose': False,
},

    # CAMERA 4: Office (lowest priority, CPU processing)
    'camera4': {
    'stream_url': 3,  # or RTSP URL
    'device': DEVICE_CPU,
    'model_size': 'yolov8n.pt',
    'resolution': (480, 360),
    'process_every_n_frames': 4,
    'priority': 'low',
    'description': 'Storage Room',
    'enable_incidents': True,
    'enable_pose': False,
},
}

# How to add RTSP cameras (IP cameras):
# Replace stream_url with RTSP URL format:
# 'stream_url': 'rtsp://username:password@192.168.1.100:554/stream1'

# ============================================================================
# MODEL PATHS
# ============================================================================

# Base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
MODEL_DIR = os.path.join(PROJECT_ROOT, 'models')
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
EVIDENCE_DIR = os.path.join(PROJECT_ROOT, 'evidence')

# Create directories if they don't exist
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(EVIDENCE_DIR, exist_ok=True)

# Model paths
YOLO_MODEL_PATH = os.path.join(MODEL_DIR, 'yolov8n.pt')
POSE_MODEL_PATH = os.path.join(MODEL_DIR, 'pose_model.pth')
BEHAVIOR_MODEL_PATH = os.path.join(MODEL_DIR, 'behavior_model.pth')

# ============================================================================
# GPU MEMORY MANAGEMENT (Critical for MX350 with 2GB VRAM)
# ============================================================================

# Set memory fraction (80% of 2GB = 1.6GB available for models)
TORCH_GPU_MEMORY_FRACTION = 0.8

# Apply memory limit if GPU is available
if torch.cuda.is_available():
    try:
        torch.cuda.set_per_process_memory_fraction(TORCH_GPU_MEMORY_FRACTION, 0)
        logger.info(f"✅ GPU memory limit set to {TORCH_GPU_MEMORY_FRACTION*100}%")
    except Exception as e:
        logger.warning(f"⚠️ Could not set GPU memory limit: {e}")

# Batch size (always 1 for real-time streaming)
BATCH_SIZE = 1

# Clear GPU cache on startup
if torch.cuda.is_available():
    torch.cuda.empty_cache()
    logger.info("✅ GPU cache cleared")

# ============================================================================
# DETECTION SETTINGS
# ============================================================================

# YOLO Detection
YOLO_CONFIDENCE_THRESHOLD = 0.5   # Minimum confidence for detections
YOLO_IOU_THRESHOLD = 0.45         # IoU threshold for NMS
YOLO_MAX_DETECTIONS = 100         # Maximum detections per frame

# Classes to detect (COCO dataset)
DETECTION_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck',
    'backpack', 'handbag', 'suitcase', 'laptop', 'cell phone'
]

# Valuable objects for theft detection
VALUABLE_OBJECTS = ['backpack', 'handbag', 'suitcase', 'laptop', 'cell phone']

# ============================================================================
# INCIDENT DETECTION SETTINGS
# ============================================================================

# Alert cooldown (seconds between same incident type alerts)
INCIDENT_COOLDOWN = 5.0

# Fall detection
FALL_ASPECT_RATIO_THRESHOLD = 0.7  # height/width < 0.7 = horizontal
FALL_CONFIDENCE_MIN = 0.5

# Violence detection  
VIOLENCE_PROXIMITY_THRESHOLD = 50  # pixels
VIOLENCE_MIN_PEOPLE = 2

# Theft detection
THEFT_PROXIMITY_THRESHOLD = 100    # pixels from valuable object
THEFT_CONFIDENCE = 0.6

# Loitering detection
LOITERING_FRAME_THRESHOLD = 30     # frames (~30 seconds at 1 FPS)

# Health emergency detection
HEALTH_EMERGENCY_FRAME_THRESHOLD = 10  # consecutive frames
HEALTH_EMERGENCY_GROUND_THRESHOLD = 0.7  # % of frame height

# Intrusion detection (customize these for your setup)
RESTRICTED_ZONES = {
    'camera0': {
        'enabled': True,
        'zones': [
            # Bottom-right quadrant example
            {'x_min': 0.7, 'x_max': 1.0, 'y_min': 0.7, 'y_max': 1.0, 'name': 'Restricted Area'}
        ]
    },
    'camera1': {
        'enabled': False,
        'zones': []
    },
    'camera2': {
        'enabled': False,
        'zones': []
    },
    'camera3': {
        'enabled': False,
        'zones': []
    },
    'camera4': {
        'enabled': False,
        'zones': []
    }
}

# ============================================================================
# BACKEND API CONFIGURATION
# ============================================================================

# Backend API URL (FastAPI server)
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')
BACKEND_API_KEY = os.getenv('BACKEND_API_KEY', '')

# API endpoints
API_ENDPOINTS = {
    'incidents': f'{BACKEND_URL}/api/incidents',
    'evidence': f'{BACKEND_URL}/api/evidence',
    'cameras': f'{BACKEND_URL}/api/cameras',
    'alerts': f'{BACKEND_URL}/api/alerts',
}

# API timeout
API_TIMEOUT = 5  # seconds

# ============================================================================
# EVIDENCE STORAGE
# ============================================================================

# Evidence settings
SAVE_EVIDENCE_LOCALLY = True
EVIDENCE_RETENTION_DAYS = 30

# Snapshot settings
SAVE_SNAPSHOTS = True
SNAPSHOT_QUALITY = 90  # JPEG quality (0-100)

# Video clip settings
SAVE_VIDEO_CLIPS = True
VIDEO_CLIP_DURATION = 10  # seconds
VIDEO_CLIP_FPS = 15
VIDEO_CODEC = 'mp4v'

# Pre-event buffer
PRE_EVENT_BUFFER_FRAMES = 30  # Capture 30 frames before event

# ============================================================================
# PERFORMANCE MONITORING
# ============================================================================

# FPS monitoring
LOG_FPS_INTERVAL = 30  # Log FPS every N processed frames

# GPU monitoring
MONITOR_GPU_MEMORY = True
GPU_MEMORY_WARNING_THRESHOLD = 0.9  # Warn if >90% used

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================

# Log levels
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

# Log format
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'

# ============================================================================
# MULTIPROCESSING SETTINGS
# ============================================================================

# Multiprocessing start method ('spawn' is safer for CUDA)
MP_START_METHOD = 'spawn'

# Number of worker processes (auto-detected based on cameras)
NUM_WORKERS = len(CAMERAS)

# ============================================================================
# SAFETY SETTINGS (Important for MX350 2GB GPU)
# ============================================================================

# Temperature monitoring (if available)
GPU_TEMP_WARNING = 80   # °C
GPU_TEMP_CRITICAL = 85  # °C

# Automatic throttling
ENABLE_AUTO_THROTTLE = True
THROTTLE_ON_HIGH_TEMP = True
THROTTLE_ON_HIGH_MEMORY = True

# Emergency stop conditions
EMERGENCY_STOP_CONDITIONS = {
    'gpu_temp': 90,        # Stop if GPU exceeds 90°C
    'gpu_memory': 0.95,    # Stop if GPU memory >95%
    'consecutive_errors': 10  # Stop after 10 consecutive errors
}

# ============================================================================
# FEATURE FLAGS
# ============================================================================

FEATURES = {
    'pose_estimation': False,      # Disable to save resources
    'behavior_classification': False,  # Disable to save resources
    'object_tracking': False,      # Disable to save resources
    'incident_detection': True,    # Core feature
    'blockchain_evidence': False,  # Not implemented yet
    'cloud_sync': False,           # Not implemented yet
}

# ============================================================================
# VALIDATION
# ============================================================================

def validate_config():
    """Validate configuration and warn about potential issues"""
    warnings = []
    
    # Check GPU memory for multiple cameras
    if torch.cuda.is_available():
        gpu_cameras = sum(1 for cam in CAMERAS.values() if cam['device'].startswith('cuda'))
        if gpu_cameras > 1:
            warnings.append(
                f"⚠️ Warning: {gpu_cameras} cameras assigned to GPU with only 2GB VRAM. "
                "This may cause out-of-memory errors. Consider using CPU for additional cameras."
            )
    
    # Check if camera streams are accessible
    for cam_id, config in CAMERAS.items():
        if isinstance(config['stream_url'], str) and config['stream_url'].startswith('rtsp'):
            logger.info(f"📹 {cam_id}: RTSP stream configured")
    
    # Print warnings
    for warning in warnings:
        logger.warning(warning)
    
    return len(warnings) == 0

# Run validation on import
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
logger.info(f"Evidence Directory: {EVIDENCE_DIR}")
logger.info("=" * 70)