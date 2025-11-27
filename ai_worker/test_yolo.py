import torch
from ultralytics import YOLO
import numpy as np

print(f"GPU Available: {torch.cuda.is_available()}")

# Print GPU name only if available and accessible
if torch.cuda.is_available():
	try:
		print(f"GPU Name: {torch.cuda.get_device_name(0)}")
	except Exception:
		print("GPU present but name not available")

# Load model (use configured device when possible)
model_path = 'yolov8n.pt'
model = YOLO(model_path)

# Choose device safely
device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
print(f"Using device: {device}")

try:
	if device.startswith('cuda'):
		model.to(device)

	# Show assigned device if model exposes it
	model_device = getattr(model, 'device', device)
	print(f"Model device: {model_device}")
	print("✅ Model loaded")

	# Test inference with a small dummy image
	test_image = np.zeros((640, 640, 3), dtype=np.uint8)
	results = model(test_image, device=device)
	print("✅ Inference successful")
except Exception as e:
	print(f"❌ Error loading/inferencing YOLO model: {e}")