import torch
from ultralytics import YOLO

print(f"GPU Available: {torch.cuda.is_available()}")
print(f"GPU Name: {torch.cuda.get_device_name(0)}")

# Load model and force to GPU
model = YOLO('yolov8n.pt')
model.to('cuda:0')  # This line is CRITICAL

print(f"Model device: {model.device}")
print("✅ YOLO is now on GPU!")

# Test inference to confirm GPU usage
import numpy as np
test_image = np.zeros((640, 640, 3), dtype=np.uint8)  # Dummy image
results = model(test_image, device='cuda:0')  # Force GPU inference
print("✅ GPU inference working!")