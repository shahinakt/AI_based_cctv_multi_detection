# temp_ai_webcam_test.py
"""
Temporary script to test AI worker tuning using your webcam.
This script will run inference using the ai_worker package on your webcam stream.
If the test is successful, you can delete this file.
"""



import cv2
import time
import os
try:
    from ai_worker.models.yolo_detector import YOLODetector
except ImportError as e:
    print(f"Failed to import YOLODetector: {e}")
    exit(1)

# Set device: 'cuda:0' for GPU, 'cpu' for CPU

import cv2
import time


# Import all main ai_worker modules and submodules for verification
try:
    import ai_worker
    import ai_worker.config
    import ai_worker.config_manager
    import ai_worker.api_server
    import ai_worker.__main__
    # Inference submodules
    import ai_worker.inference
    import ai_worker.inference.dynamic_camera_manager
    import ai_worker.inference.event_detector
    import ai_worker.inference.exporter
    import ai_worker.inference.fall_detector
    import ai_worker.inference.incident_detector
    import ai_worker.inference.multi_camera_worker
    import ai_worker.inference.severity_scorer
    import ai_worker.inference.single_camera_worker
    import ai_worker.inference.stream_worker
    import ai_worker.inference.websocket_stream_worker
    ## Removed import of violence_detector; use IncidentDetector for violence detection
    # Models
    import ai_worker.models
    import ai_worker.models.yolo_detector
    # Training (if present)
    import ai_worker.training
    # Utils (if present)
    import ai_worker.utils
    # Data submodules
    import ai_worker.data
    import ai_worker.data.augmentation
    import ai_worker.data.loader
    import ai_worker.data.synthetic_generator
    print("All ai_worker modules imported successfully.")
except ImportError as e:
    print(f"Failed to import ai_worker modules: {e}")
    exit(1)

# Import YOLODetector and IncidentDetector after ai_worker imports
from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.inference.incident_detector import IncidentDetector
## Removed import of SmartViolenceDetector; use IncidentDetector for violence detection

# Set device: 'cuda:0' for GPU, 'cpu' for CPU
device = "cuda:0"  # Change to "cpu" if you want CPU only
model_path = "ai_worker/yolov8n.pt"  # Adjust if needed

# Initialize YOLO detector
detector = YOLODetector(model_path=model_path, device=device)

# Initialize IncidentDetector
incident_detector = IncidentDetector(camera_id="test_cam", alert_cooldown=5.0)
frame_number = 0


# Open webcam
cap = cv2.VideoCapture(0)
# Set a larger resolution (e.g., 1280x480 for a wider view)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
if not cap.isOpened():
    print("Could not open webcam.")
    exit(1)

print("Starting webcam detection with incident analysis. Press 'q' to quit.")
while True:

    ret, frame = cap.read()
    if not ret or frame is None:
        print("Failed to grab frame.")
        break

    frame_number += 1
    # Run detection only if frame is valid
    detections = []
    if frame is not None:
        detections = detector.predict(frame, conf=0.6, iou=0.45)
        # Incident detection
        incidents = incident_detector.analyze_frame(detections, frame, frame_number)
    else:
        incidents = []

    # Draw boxes and labels
    for det in detections:
        bbox = [int(x) for x in det["bbox"]]
        label = f"{det['class_name']} {det['conf']:.2f}"
        cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 255, 0), 2)
        cv2.putText(frame, label, (bbox[0], bbox[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    # Draw incident info if detected
    y_offset = 30


    for incident in incidents:
        description = incident.get('description', '[No description provided]')
        text = f"INCIDENT: {incident.get('type', 'unknown')} | Severity: {incident.get('severity', 'unknown')} | {description}"
        cv2.putText(frame, text, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        y_offset += 30
        print(f"[INCIDENT] {text}")

        # Save snapshot to data/captures
        captures_dir = os.path.join('data', 'captures')
        os.makedirs(captures_dir, exist_ok=True)
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        incident_type = incident.get('type', 'incident')
        filename = f"{incident_type}_{timestamp}_frame{frame_number}.jpg"
        filepath = os.path.join(captures_dir, filename)
        cv2.imwrite(filepath, frame)
        print(f"[SNAPSHOT SAVED] {filepath}")

    cv2.imshow("Webcam Detection + Incidents", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("Test complete. You can now delete this file.")
