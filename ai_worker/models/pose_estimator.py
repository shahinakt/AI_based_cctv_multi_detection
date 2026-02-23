
"""
ai_worker/models/pose_estimator.py - FIXED VERSION
BUG FIXED: _estimate_mediapipe now computes and returns 'bbox' key from keypoints.
Without 'bbox', incident_detector._update_person_tracking skips EVERY pose -> zero incidents.
"""
import mediapipe as mp
import cv2
import numpy as np
from typing import List, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PoseEstimator:
    """
    Human pose estimation using MediaPipe (primary) with fallback
    """

    def __init__(self, use_mediapipe: bool = True, min_detection_confidence: float = 0.5):
        self.use_mediapipe = use_mediapipe

        if use_mediapipe:
            try:
                self.mp_pose = mp.solutions.pose
                self.pose = self.mp_pose.Pose(
                    static_image_mode=False,
                    model_complexity=1,
                    min_detection_confidence=min_detection_confidence,
                    min_tracking_confidence=0.5,
                )
                self.mp_draw = mp.solutions.drawing_utils
                logger.info("✅ MediaPipe Pose initialized")
            except Exception as e:
                logger.error(f"Failed to initialize MediaPipe: {e}")
                logger.warning("Falling back to simple detection")
                self.use_mediapipe = False
                self.pose = None
        else:
            self.pose = None
            logger.info("Using fallback pose detection")

    def estimate(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if self.use_mediapipe and self.pose is not None:
            return self._estimate_mediapipe(frame)
        else:
            return self._estimate_fallback(frame)

    def _estimate_mediapipe(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Estimate pose using MediaPipe.

        FIXED: now computes a pixel-space bounding box from the visible keypoints
        and includes it as 'bbox' in the returned dict.  Without this key,
        IncidentDetector._update_person_tracking() skips every pose and
        tracked_people is always empty, so NO incident is ever fired.
        """
        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.pose.process(rgb_frame)

            poses = []

            if results.pose_landmarks:
                frame_h, frame_w = frame.shape[:2]
                keypoints = []
                confidences = []

                for lm in results.pose_landmarks.landmark:
                    x = lm.x * frame_w
                    y = lm.y * frame_h
                    confidence = lm.visibility
                    keypoints.append((x, y, confidence))
                    confidences.append(confidence)

                avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

                # ── FIX: derive bounding box from visible keypoints ──────────────
                visible_pts = [(kp[0], kp[1]) for kp in keypoints if kp[2] > 0.3]
                if visible_pts:
                    xs = [p[0] for p in visible_pts]
                    ys = [p[1] for p in visible_pts]
                    # Add a small margin so the box is not pixel-tight
                    pad_x = max(10, (max(xs) - min(xs)) * 0.05)
                    pad_y = max(10, (max(ys) - min(ys)) * 0.05)
                    x1 = max(0, min(xs) - pad_x)
                    y1 = max(0, min(ys) - pad_y)
                    x2 = min(frame_w, max(xs) + pad_x)
                    y2 = min(frame_h, max(ys) + pad_y)
                    bbox = [x1, y1, x2, y2]
                else:
                    # Whole-frame fallback – very coarse but won't be skipped
                    bbox = [0.0, 0.0, float(frame_w), float(frame_h)]
                # ─────────────────────────────────────────────────────────────────

                poses.append({
                    "keypoints": keypoints,
                    "conf": avg_confidence,
                    "num_keypoints": len(keypoints),
                    "bbox": bbox,           # ← THE FIX
                })

            return poses

        except Exception as e:
            logger.error(f"MediaPipe estimation error: {e}")
            return []

    def _estimate_fallback(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Simple fallback pose detection (center of frame).
        Returns at least a valid bbox so callers don't skip it.
        """
        h, w = frame.shape[:2]
        center_x = w / 2
        center_y = h / 2
        return [{
            "keypoints": [(center_x, center_y, 0.5)],
            "conf": 0.5,
            "num_keypoints": 1,
            "bbox": [w * 0.2, h * 0.1, w * 0.8, h * 0.9],  # ← also add bbox here
        }]

    def draw_pose(self, frame: np.ndarray, poses: List[Dict[str, Any]]) -> np.ndarray:
        output = frame.copy()
        for pose in poses:
            keypoints = pose["keypoints"]
            for (x, y, conf) in keypoints:
                if conf > 0.5:
                    cv2.circle(output, (int(x), int(y)), 3, (0, 255, 0), -1)
            if len(keypoints) >= 33:
                connections = [
                    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
                    (11, 23), (12, 24), (23, 24), (23, 25), (25, 27),
                    (24, 26), (26, 28),
                ]
                for (si, ei) in connections:
                    if si < len(keypoints) and ei < len(keypoints):
                        s, e = keypoints[si], keypoints[ei]
                        if s[2] > 0.5 and e[2] > 0.5:
                            cv2.line(output, (int(s[0]), int(s[1])), (int(e[0]), int(e[1])), (0, 255, 0), 2)
        return output

    def get_pose_features(self, pose: Dict[str, Any]) -> Dict[str, float]:
        if not pose or not pose.get("keypoints"):
            return {}
        keypoints = pose["keypoints"]
        xs = [kp[0] for kp in keypoints if kp[2] > 0.5]
        ys = [kp[1] for kp in keypoints if kp[2] > 0.5]
        if not xs or not ys:
            return {}
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        width = max_x - min_x
        height = max_y - min_y
        return {
            "bbox": [min_x, min_y, max_x, max_y],
            "width": width,
            "height": height,
            "aspect_ratio": height / width if width > 0 else 0,
            "center_x": (min_x + max_x) / 2,
            "center_y": (min_y + max_y) / 2,
            "confidence": pose["conf"],
        }

    def __del__(self):
        if hasattr(self, "pose") and self.pose is not None:
            self.pose.close()