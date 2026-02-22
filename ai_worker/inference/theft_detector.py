"""
ai_worker/inference/theft_detector.py
Fixed & Production-Ready Smart Theft Detector
"""

import numpy as np
from collections import defaultdict, deque
import time
import logging
import os

logger = logging.getLogger(__name__)


class SmartTheftDetector:

    def __init__(self, camera_id: str):
        self.camera_id = camera_id

        # Object tracking
        self.object_owners = {}              # object_id -> owner_id
        self.object_positions = {}           # object_id -> last center
        self.object_stationary_frames = defaultdict(int)
        self.object_missing_frames = defaultdict(int)

        # Suspicion tracking
        self.theft_candidates = defaultdict(lambda: {
            "frames": 0,
            "score": 0.0,
            "last_frame": 0
        })

        self.VALUABLE_OBJECTS = [
            "backpack", "handbag", "suitcase",
            "laptop", "cell phone", "purse"
        ]

        self.MIN_CONF_PERSON = float(os.getenv("MIN_CONF_PERSON", "0.6"))
        self.MIN_CONF_VALUABLE = float(os.getenv("MIN_CONF_VALUABLE", "0.5"))

        logger.info(f"SmartTheftDetector initialized for {camera_id}")

    # =========================================================
    # MAIN ENTRY
    # =========================================================
    def analyze_theft(self, detections, frame, frame_number, current_time):

        incidents = []

        persons = [
            d for d in detections
            if d["class_name"] == "person" and d["conf"] > self.MIN_CONF_PERSON
        ]

        valuables = [
            d for d in detections
            if d["class_name"] in self.VALUABLE_OBJECTS
            and d["conf"] > self.MIN_CONF_VALUABLE
        ]

        visible_object_ids = set()

        # -----------------------------------------------------
        # Track visible objects
        # -----------------------------------------------------
        for val in valuables:
            object_id = self._get_object_id(val)
            visible_object_ids.add(object_id)

            center = self._get_bbox_center(val["bbox"])

            # Track movement
            if object_id in self.object_positions:
                movement = self._euclidean(center, self.object_positions[object_id])

                if movement < 10:
                    self.object_stationary_frames[object_id] += 1
                else:
                    self.object_stationary_frames[object_id] = 0

            self.object_positions[object_id] = center
            self.object_missing_frames[object_id] = 0

            # Update ownership
            self._update_ownership(object_id, val, persons)

        # -----------------------------------------------------
        # Detect missing objects (possible theft)
        # -----------------------------------------------------
        for object_id in list(self.object_positions.keys()):

            if object_id not in visible_object_ids:
                self.object_missing_frames[object_id] += 1

                # Object was stable and now missing
                if (
                    self.object_stationary_frames[object_id] > 15 and
                    self.object_missing_frames[object_id] > 6
                ):
                    if self.object_owners.get(object_id) is None:
                        severity = "high"
                    else:
                        severity = "critical"

                    incidents.append({
                        "type": "theft_detected",
                        "severity": severity,
                        "confidence": 0.9,
                        "description": "Valuable object removed from monitored area.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time,
                        "object_id": object_id
                    })

                    logger.warning(
                        f"🚨 THEFT DETECTED on {self.camera_id} ({object_id})"
                    )

                    self._clear_object(object_id)

        # -----------------------------------------------------
        # Suspicious proximity detection
        # -----------------------------------------------------
        for val in valuables:
            object_id = self._get_object_id(val)

            for person in persons:
                distance = self._calculate_distance(
                    person["bbox"], val["bbox"]
                )

                if distance < 60:

                    is_owner = (
                        self.object_owners.get(object_id)
                        == self._get_person_id(person)
                    )

                    suspicion = self._behavior_score(
                        distance,
                        is_owner,
                        self.object_stationary_frames[object_id]
                    )

                    key = f"{object_id}_{self._get_person_id(person)}"

                    self.theft_candidates[key]["frames"] += 1
                    self.theft_candidates[key]["score"] += suspicion
                    self.theft_candidates[key]["last_frame"] = frame_number

                    # Confirm suspicious interaction
                    if self.theft_candidates[key]["frames"] >= 12:

                        avg_score = (
                            self.theft_candidates[key]["score"] /
                            self.theft_candidates[key]["frames"]
                        )

                        if avg_score > 0.75 and not is_owner:

                            incidents.append({
                                "type": "potential_theft",
                                "severity": "medium",
                                "confidence": avg_score,
                                "description": "Suspicious interaction with valuable object.",
                                "camera_id": self.camera_id,
                                "timestamp": current_time,
                                "object_id": object_id
                            })

                            logger.warning(
                                f"⚠️ Suspicious behavior detected on {self.camera_id}"
                            )

                            del self.theft_candidates[key]

        self._cleanup_candidates(frame_number)

        return incidents

    # =========================================================
    # OWNERSHIP TRACKING
    # =========================================================
    def _update_ownership(self, object_id, val, persons):

        closest_person = None
        min_dist = float("inf")

        for p in persons:
            dist = self._calculate_distance(p["bbox"], val["bbox"])
            if dist < min_dist:
                min_dist = dist
                closest_person = p

        if closest_person and min_dist < 70:

            person_id = self._get_person_id(closest_person)

            if object_id not in self.object_owners:
                self.object_owners[object_id] = person_id
            else:
                # Ownership reinforcement only if same person
                if self.object_owners[object_id] == person_id:
                    pass

    # =========================================================
    # BEHAVIOR SCORE
    # =========================================================
    def _behavior_score(self, distance, is_owner, stationary_frames):

        score = 0.0

        if not is_owner:
            if distance < 30:
                score += 0.5
            elif distance < 50:
                score += 0.4
            else:
                score += 0.2

        if stationary_frames > 20:
            score += 0.3

        return min(score, 1.0)

    # =========================================================
    # UTILITIES
    # =========================================================
    def _get_object_id(self, valuable):
        bbox = valuable["bbox"]
        return f"{valuable['class_name']}_{int(bbox[0]//40)}_{int(bbox[1]//40)}"

    def _get_person_id(self, person):
        bbox = person["bbox"]
        return f"person_{int(bbox[0]//40)}_{int(bbox[1]//40)}"

    def _get_bbox_center(self, bbox):
        return (
            (bbox[0] + bbox[2]) / 2,
            (bbox[1] + bbox[3]) / 2
        )

    def _calculate_distance(self, bbox1, bbox2):
        return self._euclidean(
            self._get_bbox_center(bbox1),
            self._get_bbox_center(bbox2)
        )

    def _euclidean(self, p1, p2):
        return np.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2)

    def _clear_object(self, object_id):
        self.object_owners.pop(object_id, None)
        self.object_positions.pop(object_id, None)
        self.object_stationary_frames.pop(object_id, None)
        self.object_missing_frames.pop(object_id, None)

    def _cleanup_candidates(self, frame_number):
        for key in list(self.theft_candidates.keys()):
            if frame_number - self.theft_candidates[key]["last_frame"] > 20:
                del self.theft_candidates[key]

    def reset(self):
        self.object_owners.clear()
        self.object_positions.clear()
        self.object_stationary_frames.clear()
        self.object_missing_frames.clear()
        self.theft_candidates.clear()