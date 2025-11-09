# ai_worker/models/yolo_detector.py
from ultralytics import YOLO
import torch
import logging

logger = logging.getLogger(__name__)

class YOLODetector:
    def __init__(self, model_path: str, device: str = 'cuda:0'):
        """
        Initialize YOLO detector with specific device
        
        Args:
            model_path: Path to YOLO model weights
            device: 'cuda:0' for GPU or 'cpu' for CPU
        """
        self.device = device
        
        # Set memory fraction for MX350 if using GPU
        if device.startswith('cuda'):
            torch.cuda.set_per_process_memory_fraction(0.8, 0)
            logger.info(f"GPU memory limit set to 80% of available")
        
        # Load model
        self.model = YOLO(model_path)
        self.model.to(device)
        
        logger.info(f"YOLO loaded on {device}")
    
    def predict(self, frame, conf=0.5):
        """
        Run detection on frame
        
        Args:
            frame: Input frame (numpy array)
            conf: Confidence threshold
            
        Returns:
            List of detections with bbox, conf, class
        """
        # Force device during inference
        results = self.model(frame, device=self.device, conf=conf, verbose=False)
        
        detections = []
        for r in results:
            boxes = r.boxes
            for box in boxes:
                detections.append({
                    'bbox': box.xyxy[0].cpu().numpy().tolist(),
                    'conf': float(box.conf[0]),
                    'class': int(box.cls[0]),
                    'class_name': self.model.names[int(box.cls[0])]
                })
        
        return detections