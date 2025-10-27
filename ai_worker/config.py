# ai_worker/config.py
import os

# Camera configurations
CAMERAS = {
    'camera0': 'rtsp://admin:password@192.168.1.100/stream',
    'camera1': 'rtsp://admin:password@192.168.1.101/stream'
}

# Model paths
YOLO_MODEL_PATH = 'models/yolov8n.pt'
POSE_MODEL_PATH = 'models/pose_model.pth'
BEHAVIOR_MODEL_PATH = 'models/behavior_model.pth'

# Sensitivity settings
DETECTION_CONFIDENCE_THRESHOLD = 0.5
EVENT_PERSISTENCE_FRAMES = 3
EVENT_COOLDOWN_SECONDS = 5.0

# Evidence saving
EVIDENCE_BUFFER_SIZE = 90  # 3 seconds at 30 FPS
CAPTURE_DIR = 'data/captures'

# Backend API
BACKEND_URL = 'http://localhost:8000/api/incidents'