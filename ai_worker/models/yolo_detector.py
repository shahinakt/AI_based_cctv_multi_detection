# ai_worker/models/yolo_detector.py
from ultralytics import YOLO
import torch
import numpy as np
from typing import List, Dict, Any

class YOLODetector:
    def __init__(self, model_path: str = 'yolov8n.pt', device: str = 'cuda' if torch.cuda.is_available() else 'cpu'):
        self.model = YOLO(model_path)
        self.model.to(device)
        self.device = device

    def predict(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        results = self.model(frame, verbose=False)[0]
        detections = []
        for box in results.boxes:
            if box.conf > 0.5:  # Threshold per spec
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = box.conf[0].cpu().numpy()
                cls = int(box.cls[0].cpu().numpy())
                detections.append({
                    'bbox': [int(x1), int(y1), int(x2-x1), int(y2-y1)],
                    'conf': float(conf),
                    'class': self.model.names[cls]
                })
        return detections