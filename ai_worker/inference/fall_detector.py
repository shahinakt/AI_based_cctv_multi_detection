"""
ai_worker/inference/fall_detector.py
Production-grade Context-Aware Fall Detection
"""

import logging
import numpy as np
from collections import defaultdict, deque

logger = logging.getLogger(__name__)


class SmartFallDetector:

    def __init__(self, camera_id: str):
        self.camera_id = camera_id

        # Per-person history (stable tracking)
        self.person_tracks = defaultdict(lambda: deque(maxlen=15))

        # Fall state tracking
        self.fall_candidates = {}

        self.MIN_CONF_PERSON = 0.4
        self.HORIZONTAL_THRESHOLD = 0.6
        self.DROP_RATIO = 0.2        # 20% of frame height
        self.GROUND_RATIO = 0.85     # bottom 15% of frame
        self.CONFIRM_FRAMES = 8
        self.MOTIONLESS_FRAMES = 10

        logger.info(f"SmartFallDetector initialized for {camera_id}")

    # =========================================================
    # MAIN ENTRY
    # =========================================================
    def analyze_fall(self, detections, frame, frame_number, current_time):

        incidents = []
        frame_h = frame.shape[0]

        tracked_people = self._update_tracks(detections)

        for pid, history in tracked_people:

            if len(history) < 6:
                continue

            recent = list(history)[-6:]

            y_positions = [f["center"][1] for f in recent]

            # Calculate vertical drop
            drop = max(y_positions) - min(y_positions)

            # Current posture
            last_bbox = recent[-1]["bbox"]
            w = last_bbox[2] - last_bbox[0]
            h = last_bbox[3] - last_bbox[1]

            if w <= 0:
                continue

            aspect_ratio = h / w
            horizontal = aspect_ratio < self.HORIZONTAL_THRESHOLD
            on_ground = last_bbox[3] > frame_h * self.GROUND_RATIO

            sudden_drop = drop > frame_h * self.DROP_RATIO

            if sudden_drop and horizontal and on_ground:

                if pid not in self.fall_candidates:
                    self.fall_candidates[pid] = {
                        "count": 1,
                        "last_y": y_positions[-1],
                        "motionless": 0
                    }
                else:
                    self.fall_candidates[pid]["count"] += 1

                    # Check motionless
                    dy = abs(y_positions[-1] - self.fall_candidates[pid]["last_y"])

                    if dy < frame_h * 0.02:
                        self.fall_candidates[pid]["motionless"] += 1
                    else:
                        self.fall_candidates[pid]["motionless"] = 0

                    self.fall_candidates[pid]["last_y"] = y_positions[-1]

                # Confirm fall
                if (
                    self.fall_candidates[pid]["count"] >= self.CONFIRM_FRAMES and
                    self.fall_candidates[pid]["motionless"] >= self.MOTIONLESS_FRAMES
                ):
                    incidents.append({
                        "type": "fall_detected",
                        "severity": "critical",
                        "confidence": 0.9,
                        "description": "Confirmed fall with sudden drop and no movement.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time,
                        "bbox": last_bbox,
                        "frame_number": frame_number
                    })

                    logger.error(f"🚨 CONFIRMED FALL on {self.camera_id}")

                    del self.fall_candidates[pid]

            else:
                if pid in self.fall_candidates:
                    del self.fall_candidates[pid]

        return incidents

    # =========================================================
    # STABLE PERSON TRACKING
    # =========================================================
    def _update_tracks(self, detections):

        updated_tracks = {}
        tracked = []

        for det in detections:

            if det["class_name"] != "person" or det["conf"] < self.MIN_CONF_PERSON:
                continue

            bbox = det["bbox"]
            center = self._center(bbox)

            matched_id = None

            for pid, history in self.person_tracks.items():
                last_center = history[-1]["center"]
                if self._distance(center, last_center) < 60:
                    matched_id = pid
                    break

            if matched_id is None:
                matched_id = len(self.person_tracks)

            if matched_id not in updated_tracks:
                updated_tracks[matched_id] = deque(maxlen=15)

            updated_tracks[matched_id].append({
                "bbox": bbox,
                "center": center
            })

            tracked.append((matched_id, updated_tracks[matched_id]))

        self.person_tracks = updated_tracks

        return tracked

    # =========================================================
    # UTILITIES
    # =========================================================
    def _distance(self, p1, p2):
        return np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

    def _center(self, bbox):
        return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)

    def reset(self):
        self.person_tracks.clear()
        self.fall_candidates.clear()