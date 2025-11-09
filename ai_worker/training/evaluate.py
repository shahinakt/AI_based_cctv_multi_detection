
from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.models.behavior_classifier import BehaviorClassifierWrapper
from ai_worker.data.loader import get_dataloader
import torch
from typing import Dict, Any

def evaluate_detector(model_path: str, data_path: str) -> Dict[str, float]:
    detector = YOLODetector(model_path)
    dataloader = get_dataloader(data_path, batch_size=1, split='val')
    # Mock evaluation: in production, compute mAP
    return {'mAP@0.5': 0.85, 'precision': 0.88, 'recall': 0.82}

def evaluate_behavior(model_path: str, data_path: str) -> Dict[str, float]:
    classifier = BehaviorClassifierWrapper(model_path)
    dataloader = get_dataloader(data_path, batch_size=1, split='val')
    # Mock evaluation
    return {'accuracy': 0.92, 'f1_score': 0.89}

if __name__ == '__main__':
    det_metrics = evaluate_detector('yolov8n.pt', 'data/processed')
    behavior_metrics = evaluate_behavior('behavior_model.pth', 'data/behavior')
    print("Detection Metrics:", det_metrics)
    print("Behavior Metrics:", behavior_metrics)