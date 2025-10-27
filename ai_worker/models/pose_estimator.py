# ai_worker/models/pose_estimator.py
import mediapipe as mp
import cv2
import numpy as np
from typing import List, Dict, Any

class PoseEstimator:
    def __init__(self, use_mediapipe: bool = True):
        if use_mediapipe:
            self.mp_pose = mp.solutions.pose
            self.pose = self.mp_pose.Pose(static_image_mode=False, model_complexity=1)
            self.mp_draw = mp.solutions.drawing_utils
        else:
            # Fallback OpenPose mock (in production, use cv2.dnn.readNet for actual OpenPose)
            self.pose = None

    def estimate(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if hasattr(self, 'mp_pose'):
            results = self.pose.process(rgb_frame)
            poses = []
            if results.pose_landmarks:
                keypoints = []
                for lm in results.pose_landmarks.landmark:
                    keypoints.append((lm.x * frame.shape[1], lm.y * frame.shape[0], lm.visibility))
                poses.append({'keypoints': keypoints, 'conf': results.pose_landmarks.visibility[0] if len(results.pose_landmarks.visibility) > 0 else 0.0})
            return poses
        else:
            # Fallback mock: detect simple pose (e.g., head/shoulders)
            return [{'keypoints': [(frame.shape[1]/2, frame.shape[0]/2, 0.5)], 'conf': 0.5}]  # Placeholder