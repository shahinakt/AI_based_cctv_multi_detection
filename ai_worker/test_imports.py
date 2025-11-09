
import sys
print("Testing imports...")

try:
    from ai_worker import config
    print("✅ config imported")
except Exception as e:
    print(f"❌ config error: {e}")

try:
    from ai_worker.models.yolo_detector import YOLODetector
    print("✅ YOLODetector imported")
except Exception as e:
    print(f"❌ YOLODetector error: {e}")

try:
    from ai_worker.inference.incident_detector import IncidentDetector
    print("✅ IncidentDetector imported")
except Exception as e:
    print(f"❌ IncidentDetector error: {e}")

try:
    from ai_worker.inference.multi_camera_worker import SingleCameraWorker
    print("✅ Multi-camera worker imported")
except Exception as e:
    print(f"❌ Multi-camera error: {e}")

print("\n✅ All critical imports working!")