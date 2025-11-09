# ai_worker/config.py
import os
import torch

# GPU Configuration for MX350 (2GB VRAM)
DEVICE_GPU = 'cuda:0' if torch.cuda.is_available() else 'cpu'
DEVICE_CPU = 'cpu'

# Camera Configuration with Device Assignment
CAMERAS = {
    'camera0': {
        'stream_url': 0,  # Webcam for testing
        'device': DEVICE_GPU,  # Main camera on GPU
        'model_size': 'yolov8n.pt',  # Nano only for 2GB VRAM
        'resolution': (640, 480),
        'process_every_n_frames': 1,  # Process every frame
        'priority': 'high'
    },
    'camera1': {
        'stream_url': 1,
        'device': DEVICE_CPU,  # Secondary on CPU
        'model_size': 'yolov8n.pt',
        'resolution': (640, 480),
        'process_every_n_frames': 2,  # Process every 2nd frame
        'priority': 'medium'
    },
    'camera2': {
        'stream_url': 2,
        'device': DEVICE_CPU,
        'model_size': 'yolov8n.pt',
        'resolution': (480, 360),  # Lower res for CPU
        'process_every_n_frames': 3,
        'priority': 'low'
    }
}

# Model Paths
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
YOLO_MODEL_PATH = os.path.join(MODEL_DIR, 'yolov8n.pt')

# Memory Management for MX350
TORCH_GPU_MEMORY_FRACTION = 0.8  # Use 80% of 2GB = 1.6GB
BATCH_SIZE = 1  # Never batch for 2GB GPU

# Backend API
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')