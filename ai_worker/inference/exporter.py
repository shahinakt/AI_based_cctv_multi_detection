# ai_worker/inference/exporter.py
import torch
from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.models.behavior_classifier import BehaviorClassifier
import onnx

def export_yolo(model_path: str, output_path: str = 'yolo.onnx'):
    model = YOLODetector(model_path)
    # Mock export: in production, use ultralytics export or torch.onnx.export
    dummy_input = torch.randn(1, 3, 640, 640)
    torch.onnx.export(model.model, dummy_input, output_path, opset_version=11)

def export_behavior(model_path: str, output_path: str = 'behavior.onnx'):
    model = BehaviorClassifier()
    if model_path:
        model.load_state_dict(torch.load(model_path))
    dummy_input = torch.randn(1, 3, 224, 224)
    torch.onnx.export(model, dummy_input, output_path, opset_version=11)

if __name__ == '__main__':
    export_yolo('yolov8n.pt')
    export_behavior('behavior_model.pth')