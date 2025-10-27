# ai_worker/models/behavior_classifier.py
import torch
import torch.nn as nn
from torchvision import models
from typing import List, Dict, Any
import numpy as np

class BehaviorClassifier(nn.Module):
    def __init__(self, num_classes: int = 3):  # normal, fall, fight
        super().__init__()
        self.backbone = models.resnet18(pretrained=True)
        self.backbone.fc = nn.Linear(self.backbone.fc.in_features, num_classes)
        self.temporal_pool = nn.AdaptiveAvgPool1d(1)  # For sequences

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # x: (B, T, C, H, W) or (B, C, H, W)
        if len(x.shape) == 5:
            B, T, C, H, W = x.shape
            x = x.view(B * T, C, H, W)
        feats = self.backbone(x)
        if len(x.shape) == 5:
            feats = feats.view(B, T, -1)
            feats = self.temporal_pool(feats.transpose(1, 2)).squeeze(-1)
        return feats

class BehaviorClassifierWrapper:
    def __init__(self, model_path: str = None, device: str = 'cuda' if torch.cuda.is_available() else 'cpu'):
        self.model = BehaviorClassifier()
        if model_path:
            self.model.load_state_dict(torch.load(model_path))
        self.model.to(device)
        self.device = device
        self.model.eval()

    def classify(self, pose_sequence: List[List[tuple]]) -> Dict[str, float]:  # Sequence of keypoints per frame
        # Mock input: flatten poses to image-like (production: render keypoints to image)
        input_tensor = torch.rand(1, 3, 224, 224).to(self.device)  # Placeholder; in production, render actual pose images
        with torch.no_grad():
            logits = self.model(input_tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
        return {
            'normal': float(probs[0]),
            'fall': float(probs[1]),
            'fight': float(probs[2])
        }