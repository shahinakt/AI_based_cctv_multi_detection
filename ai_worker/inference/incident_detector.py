from collections import defaultdict, deque
import numpy as np
import time
import logging
from ai_worker.models.pose_estimator import PoseEstimator

logger = logging.getLogger(__name__)


class IncidentDetector:

    def __init__(self, camera_id: str, alert_cooldown: float = 8.0):
        self.camera_id = camera_id
        self.alert_cooldown = alert_cooldown
        self.last_alert_time = {}

        self.pose_estimator = PoseEstimator(use_mediapipe=True)

        self.person_tracks = {}
        self.person_id_counter = 0

        self.object_tracks = {}
        self.object_missing_frames = defaultdict(int)
        self.object_stationary_frames = defaultdict(int)

        self.violence_pairs = defaultdict(int)

        logger.info(f"Production-safe IncidentDetector initialized for {camera_id}")

    # =========================================================
    # MAIN ENTRY
    # =========================================================
    def analyze_frame(self, detections, frame, frame_number):

        current_time = time.time()
        incidents = []

        try:
            poses = self.pose_estimator.estimate(frame)
        except Exception as e:
            logger.warning(f"Pose estimation failed: {e}")
            poses = []

        tracked_people = self._update_person_tracking(poses)

        incidents += self._detect_attack(tracked_people, current_time)
        incidents += self._detect_fall(tracked_people, current_time)
        incidents += self._detect_theft(detections, current_time)
        incidents += self._detect_proximity_violence(tracked_people, current_time)

        return self._apply_cooldown(incidents, current_time)

    # =========================================================
    # SAFE PERSON TRACKING
    # =========================================================
    def _update_person_tracking(self, poses):

        updated_tracks = {}

        for pose in poses:

            if pose.get("conf", 0) < 0.5:
                continue

            if pose.get("num_keypoints", 0) < 17:
                continue

            bbox = pose.get("bbox")
            keypoints = pose.get("keypoints")

            if not bbox or len(bbox) != 4 or not keypoints:
                continue

            center = self._center(bbox)

            matched_id = None
            for pid, track in self.person_tracks.items():
                if len(track) == 0:
                    continue
                last_center = track[-1]["center"]
                if self._distance(center, last_center) < 60:
                    matched_id = pid
                    break

            if matched_id is None:
                matched_id = self.person_id_counter
                self.person_id_counter += 1
                updated_tracks[matched_id] = deque(maxlen=15)
            else:
                updated_tracks[matched_id] = self.person_tracks[matched_id]

            updated_tracks[matched_id].append({
                "bbox": bbox,
                "center": center,
                "keypoints": keypoints
            })

        self.person_tracks = updated_tracks
        return list(self.person_tracks.items())

    # =========================================================
    # ATTACK DETECTION
    # =========================================================
    def _detect_attack(self, tracked_people, current_time):

        incidents = []

        for i in range(len(tracked_people)):
            id1, hist1 = tracked_people[i]

            if len(hist1) < 6:
                continue

            for j in range(i + 1, len(tracked_people)):
                id2, hist2 = tracked_people[j]

                if len(hist2) < 6:
                    continue

                # Persons must be close
                dist = self._distance(
                    hist1[-1]["center"],
                    hist2[-1]["center"]
                )

                if dist > 180:
                    continue

                # 🔥 Slap detection
                if self._check_slap(hist1, hist2):
                    incidents.append({
                        "type": "slap_detected",
                        "severity": "high",
                        "confidence": 0.93,
                        "description": "Rapid hand strike toward face detected.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time
                    })
                    return incidents

        return incidents
    def _check_slap(self, hist1, hist2):

        if len(hist1) < 6 or len(hist2) == 0:
            return False

        recent1 = list(hist1)[-6:]
        WRISTS = [15, 16]  # Mediapipe wrist indexes

        for wrist_idx in WRISTS:

            try:
                wrist_positions = [
                    (f["keypoints"][wrist_idx][0],
                     f["keypoints"][wrist_idx][1])
                    for f in recent1
                ]
            except Exception:
                continue

            if len(wrist_positions) < 2:
                continue

            # --- Compute velocity ---
            velocities = [
                self._distance(wrist_positions[k], wrist_positions[k - 1])
                for k in range(1, len(wrist_positions))
            ]

            if not velocities:
                continue

            avg_speed = np.mean(velocities)

            # --- Resolution independent speed threshold ---
            # Estimate scale using person bbox height
            try:
                bbox = hist1[-1]["bbox"]
                body_height = bbox[3] - bbox[1]
            except Exception:
                body_height = 200  # fallback safe value

            speed_threshold = body_height * 0.15  # adaptive threshold

            if avg_speed < speed_threshold:
                continue

            # --- Victim head position ---
            try:
                victim_head = (
                    hist2[-1]["keypoints"][0][0],
                    hist2[-1]["keypoints"][0][1]
                )
            except Exception:
                continue

            # --- Direction check (must move toward head) ---
            movement_vector = (
                wrist_positions[-1][0] - wrist_positions[-2][0],
                wrist_positions[-1][1] - wrist_positions[-2][1]
            )

            head_vector = (
                victim_head[0] - wrist_positions[-2][0],
                victim_head[1] - wrist_positions[-2][1]
            )

            dot_product = (
                movement_vector[0] * head_vector[0] +
                movement_vector[1] * head_vector[1]
            )

            # Hand must move in direction of head
            if dot_product <= 0:
                continue

            # --- Final distance check ---
            if self._distance(wrist_positions[-1], victim_head) < body_height * 0.3:
                return True

        return False

    def _check_strike(self, hist1, hist2):

        WRISTS = [15, 16]
        recent = list(hist1)[-5:]

        for wrist_idx in WRISTS:
            try:
                wrist_positions = [
                    (f["keypoints"][wrist_idx][0],
                     f["keypoints"][wrist_idx][1])
                    for f in recent
                ]
            except Exception:
                continue

            velocities = [
                self._distance(wrist_positions[k], wrist_positions[k - 1])
                for k in range(1, len(wrist_positions))
            ]

            if len(velocities) == 0:
                continue

            if np.mean(velocities) > 35:
                try:
                    victim_head = (
                        hist2[-1]["keypoints"][0][0],
                        hist2[-1]["keypoints"][0][1]
                    )
                except Exception:
                    continue

                if self._distance(wrist_positions[-1], victim_head) < 70:
                    return True

        return False

    # =========================================================
    # FALL DETECTION
    # =========================================================
    def _detect_fall(self, tracked_people, current_time):

        incidents = []

        for pid, history in tracked_people:

            if len(history) < 8:
                continue

            recent = list(history)[-8:]

            # Get Y positions
            y_positions = [f["center"][1] for f in recent]

            aspect_ratios = []
            valid_bboxes = []

            for f in recent:
                bbox = f.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue

                valid_bboxes.append(bbox)

                w = bbox[2] - bbox[0]
                h = bbox[3] - bbox[1]

                if w > 0:
                    aspect_ratios.append(h / w)

            if not aspect_ratios or not valid_bboxes:
                continue

            # 1️⃣ Sudden vertical drop
            drop = max(y_positions) - min(y_positions)

            # Make threshold resolution independent
            frame_height_est = max(b[3] for b in valid_bboxes)
            drop_threshold = frame_height_est * 0.25

            # 2️⃣ Check body becomes horizontal
            is_horizontal = aspect_ratios[-1] < 0.55

            # 3️⃣ Ensure person was vertical before fall
            was_vertical = any(
                (b[3] - b[1]) / max(1, (b[2] - b[0])) > 1.2
                for b in valid_bboxes[:-1]
            )

            # Final condition
            if drop > drop_threshold and is_horizontal and was_vertical:

                incidents.append({
                    "type": "fall_detected",
                    "severity": "critical",
                    "confidence": 0.92,
                    "description": "Sudden vertical fall detected with posture change.",
                    "camera_id": self.camera_id,
                    "timestamp": current_time
                })

        return incidents

    # =========================================================
    # THEFT DETECTION
    # =========================================================
    def _detect_theft(self, detections, current_time):

        incidents = []
        valuables = ["backpack", "laptop", "handbag", "cell phone"]

        visible_ids = set()

        for d in detections:

            class_name = d.get("class_name")
            conf = d.get("conf", 0)
            bbox = d.get("bbox")

            if class_name not in valuables or conf < 0.5:
                continue

            if not bbox or len(bbox) != 4:
                continue

            obj_id = f"{class_name}_{int(bbox[0]//40)}_{int(bbox[1]//40)}"
            visible_ids.add(obj_id)

            center = self._center(bbox)

            if obj_id in self.object_tracks:
                movement = self._distance(center, self.object_tracks[obj_id])
                if movement < 10:
                    self.object_stationary_frames[obj_id] += 1
                else:
                    self.object_stationary_frames[obj_id] = 0

            self.object_tracks[obj_id] = center
            self.object_missing_frames[obj_id] = 0

        for obj_id in list(self.object_tracks.keys()):
            if obj_id not in visible_ids:
                self.object_missing_frames[obj_id] += 1

                if (
                    self.object_stationary_frames[obj_id] > 15 and
                    self.object_missing_frames[obj_id] > 6
                ):
                    incidents.append({
                        "type": "theft_detected",
                        "severity": "high",
                        "confidence": 0.9,
                        "description": "Object removed from scene.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time
                    })

                    del self.object_tracks[obj_id]

        return incidents

    # =========================================================
    # PROXIMITY VIOLENCE
    # =========================================================
    def _detect_proximity_violence(self, tracked_people, current_time):

        incidents = []

        for i in range(len(tracked_people)):
            for j in range(i + 1, len(tracked_people)):

                id1, hist1 = tracked_people[i]
                id2, hist2 = tracked_people[j]

                dist = self._distance(hist1[-1]["center"], hist2[-1]["center"])

                key = (id1, id2)

                if dist < 60:
                    self.violence_pairs[key] += 1
                else:
                    self.violence_pairs[key] = 0

                if self.violence_pairs[key] >= 5:
                    incidents.append({
                        "type": "violence_detected",
                        "severity": "high",
                        "confidence": 0.85,
                        "description": "Repeated close aggression detected.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time
                    })
                    self.violence_pairs[key] = 0

        return incidents

    # =========================================================
    # UTILITIES
    # =========================================================
    def _distance(self, p1, p2):
        return np.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2)

    def _center(self, bbox):
        return ((bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2)

    def _apply_cooldown(self, incidents, current_time):
        filtered = []
        for inc in incidents:
            t = inc["type"]
            if t not in self.last_alert_time or \
               current_time - self.last_alert_time[t] > self.alert_cooldown:
                self.last_alert_time[t] = current_time
                filtered.append(inc)
        return filtered

    def reset(self):
        self.person_tracks.clear()
        self.object_tracks.clear()
        self.object_missing_frames.clear()
        self.object_stationary_frames.clear()
        self.violence_pairs.clear()
        self.last_alert_time.clear()