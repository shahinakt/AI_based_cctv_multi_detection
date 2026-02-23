from collections import defaultdict, deque
import numpy as np
import time
import logging
from ai_worker.models.pose_estimator import PoseEstimator

logger = logging.getLogger(__name__)


class IncidentDetector:

    def __init__(self, camera_id: str, alert_cooldown: float = 2.0):
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

        self.restricted_zones = [
            (100, 100, 400, 400)  # (x1, y1, x2, y2)
        ]

        self.virtual_lines = [
            ((300, 0), (300, 600))  # vertical line example
        ]

        self.intrusion_memory = set()

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
        incidents += self._detect_intrusion(tracked_people, current_time)
        incidents += self._detect_theft(detections, current_time)
        incidents += self._detect_proximity_violence(tracked_people, current_time)

        return self._apply_cooldown(incidents, current_time)

    # =========================================================
    # SAFE PERSON TRACKING
    # =========================================================
    def _update_person_tracking(self, poses):
        updated_tracks = {}

        for pose in poses:
            # FIX 1: lower confidence gate from 0.5 → 0.3
            if pose.get("conf", 0) < 0.3:
                continue

            # FIX 2: lower minimum keypoints from 17 → 13 (upper body + hips)
            if pose.get("num_keypoints", 0) < 13:
                continue

            keypoints = pose.get("keypoints")
            if not keypoints:
                continue

            # FIX 3: derive bbox from keypoints if PoseEstimator didn't set it
            bbox = pose.get("bbox")
            if not bbox or len(bbox) != 4:
                visible = [(kp[0], kp[1]) for kp in keypoints if len(kp) >= 3 and kp[2] > 0.3]
                if not visible:
                    continue
                xs = [p[0] for p in visible]
                ys = [p[1] for p in visible]
                bbox = [min(xs), min(ys), max(xs), max(ys)]

            center = self._center(bbox)

            matched_id = None
            for pid, track in self.person_tracks.items():
                if len(track) == 0:
                    continue
                if self._distance(center, track[-1]["center"]) < 60:
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
                "keypoints": keypoints,
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
            if len(hist1) < 5:
                continue

            for j in range(i + 1, len(tracked_people)):
                id2, hist2 = tracked_people[j]
                if len(hist2) < 5:
                    continue

                distance_between = self._distance(
                    hist1[-1]["center"], hist2[-1]["center"]
                )
                body_height = hist1[-1]["bbox"][3] - hist1[-1]["bbox"][1]
                if body_height <= 0:
                    continue

                if distance_between > body_height * 2.5:
                    continue

                if self._check_slap(hist1, hist2):
                    incidents.append({
                        "type": "slap_detected",
                        "severity": "high",
                        "confidence": 0.92,
                        "description": "Aggressive hand strike toward face detected.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time,
                    })
                    return incidents

                if self._check_strike(hist1, hist2):
                    incidents.append({
                        "type": "strike_detected",
                        "severity": "high",
                        "confidence": 0.88,
                        "description": "Physical strike or push detected.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time,
                    })
                    return incidents

                speed1 = self._compute_body_speed(hist1)
                speed2 = self._compute_body_speed(hist2)

                if (
                    speed1 > body_height * 0.02
                    and speed2 > body_height * 0.02
                    and distance_between < body_height
                ):
                    incidents.append({
                        "type": "fight_detected",
                        "severity": "high",
                        "confidence": 0.85,
                        "description": "Mutual aggressive motion detected.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time,
                    })
                    return incidents

        return incidents

    def _compute_body_speed(self, history):
        if len(history) < 3:
            return 0
        recent = list(history)[-3:]
        speeds = [self._distance(recent[i]["center"], recent[i - 1]["center"]) for i in range(1, len(recent))]
        return max(speeds) if speeds else 0
        
    def _check_slap(self, hist1, hist2):
        if len(hist1) < 5 or len(hist2) < 2:
            return False

        recent = list(hist1)[-5:]
        WRISTS = [15, 16]
        bbox = hist1[-1]["bbox"]
        body_height = bbox[3] - bbox[1]
        if body_height <= 0:
            return False

        speed_threshold = body_height * 0.015
        distance_threshold = body_height * 0.8

        try:
            kp2 = hist2[-1]["keypoints"]
            victim_head = (
                (kp2[0][0] + kp2[7][0] + kp2[8][0]) / 3,
                (kp2[0][1] + kp2[7][1] + kp2[8][1]) / 3,
            )
        except Exception:
            return False

        for wrist_idx in WRISTS:
            try:
                wrist_positions = [
                    (f["keypoints"][wrist_idx][0], f["keypoints"][wrist_idx][1])
                    for f in recent
                ]
            except Exception:
                continue

            if len(wrist_positions) < 2:
                continue

            velocities = [self._distance(wrist_positions[i], wrist_positions[i - 1]) for i in range(1, len(wrist_positions))]
            if not velocities:
                continue
            peak_speed = max(velocities)
            if peak_speed < speed_threshold:
                continue

            movement_vec = (wrist_positions[-1][0] - wrist_positions[-2][0], wrist_positions[-1][1] - wrist_positions[-2][1])
            head_vec = (victim_head[0] - wrist_positions[-2][0], victim_head[1] - wrist_positions[-2][1])
            dot = movement_vec[0] * head_vec[0] + movement_vec[1] * head_vec[1]

            if dot < -(body_height * 0.02):
                continue
            if self._distance(wrist_positions[-1], victim_head) < distance_threshold:
                return True

        return False

    def _check_strike(self, hist1, hist2):
        if len(hist1) < 4 or len(hist2) < 1:
            return False

        recent = list(hist1)[-4:]
        WRISTS = [15, 16]
        bbox = hist1[-1]["bbox"]
        body_height = bbox[3] - bbox[1]
        if body_height <= 0:
            return False

        speed_threshold = body_height * 0.015
        hit_threshold = body_height * 1.0

        try:
            kp2 = hist2[-1]["keypoints"]
            victim_center = (
                (kp2[0][0] + kp2[11][0] + kp2[12][0]) / 3,
                (kp2[0][1] + kp2[11][1] + kp2[12][1]) / 3,
            )
        except Exception:
            return False

        for wrist_idx in WRISTS:
            try:
                wrist_positions = [
                    (f["keypoints"][wrist_idx][0], f["keypoints"][wrist_idx][1])
                    for f in recent
                ]
            except Exception:
                continue

            if len(wrist_positions) < 2:
                continue

            velocities = [self._distance(wrist_positions[i], wrist_positions[i - 1]) for i in range(1, len(wrist_positions))]
            if not velocities:
                continue
            peak_speed = max(velocities)
            if peak_speed < speed_threshold:
                continue

            movement_vec = (wrist_positions[-1][0] - wrist_positions[-2][0], wrist_positions[-1][1] - wrist_positions[-2][1])
            head_vec = (victim_center[0] - wrist_positions[-2][0], victim_center[1] - wrist_positions[-2][1])
            dot = movement_vec[0] * head_vec[0] + movement_vec[1] * head_vec[1]

            if dot < -(body_height * 0.02):
                continue
            if self._distance(wrist_positions[-1], victim_center) < hit_threshold:
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
            y_positions = [f["center"][1] for f in recent]
            bboxes = [f["bbox"] for f in recent if f.get("bbox")]

            if len(bboxes) < 5:
                continue

            body_height = bboxes[-1][3] - bboxes[-1][1]
            if body_height <= 0:
                continue

            vertical_speed = y_positions[-1] - y_positions[-2]
            drop_amount = max(y_positions) - min(y_positions)

            try:
                kp = recent[-1]["keypoints"]
                left_shoulder = kp[11]
                right_shoulder = kp[12]
                left_hip = kp[23]
                right_hip = kp[24]

                shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2
                hip_y = (left_hip[1] + right_hip[1]) / 2
                torso_height = abs(hip_y - shoulder_y)
            except Exception:
                continue

            try:
                prev_kp = recent[-3]["keypoints"]
                prev_shoulder_y = (prev_kp[11][1] + prev_kp[12][1]) / 2
                prev_hip_y = (prev_kp[23][1] + prev_kp[24][1]) / 2
                prev_torso_height = abs(prev_hip_y - prev_shoulder_y)
            except Exception:
                continue

            torso_collapse = torso_height < prev_torso_height * 0.6

            if (
                vertical_speed > body_height * 0.03
                and drop_amount > body_height * 0.08
                and torso_collapse
            ):
                incidents.append({
                    "type": "fall_detected",
                    "severity": "critical",
                    "confidence": 0.92,
                    "description": "Sudden fall detected.",
                    "camera_id": self.camera_id,
                    "timestamp": current_time,
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
    def _detect_intrusion(self, tracked_people, current_time):
        incidents = []

        for pid, history in tracked_people:
            if len(history) < 2:
                continue

            center = history[-1]["center"]
            prev_center = history[-2]["center"]

            for zone in self.restricted_zones:
                x1, y1, x2, y2 = zone
                if x1 < center[0] < x2 and y1 < center[1] < y2:
                    if pid not in self.intrusion_memory:
                        self.intrusion_memory.add(pid)
                        incidents.append({
                            "type": "intrusion_detected",
                            "severity": "high",
                            "confidence": 0.9,
                            "description": "Unauthorized entry into restricted area.",
                            "camera_id": self.camera_id,
                            "timestamp": current_time,
                        })

            for line in self.virtual_lines:
                (lx1, ly1), (lx2, ly2) = line
                if prev_center[0] < lx1 and center[0] >= lx1:
                    incidents.append({
                        "type": "line_crossing",
                        "severity": "medium",
                        "confidence": 0.85,
                        "description": "Virtual boundary line crossed.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time,
                    })

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

                if not hist1 or not hist2:
                    continue

                dist = self._distance(hist1[-1]["center"], hist2[-1]["center"])
                key = (id1, id2)

                if dist < 140:
                    self.violence_pairs[key] += 1
                else:
                    self.violence_pairs[key] = 0

                if self.violence_pairs[key] >= 2:
                    incidents.append({
                        "type": "violence_detected",
                        "severity": "high",
                        "confidence": 0.85,
                        "description": "Repeated close aggression detected.",
                        "camera_id": self.camera_id,
                        "timestamp": current_time,
                    })
                    self.violence_pairs[key] = 0

        return incidents

    # =========================================================
    # UTILITIES
    # =========================================================
    def _distance(self, p1, p2):
        return np.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)

    def _center(self, bbox):
        return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)

    def _apply_cooldown(self, incidents, current_time):
        filtered = []
        for inc in incidents:
            t = inc["type"]
            if t not in self.last_alert_time or current_time - self.last_alert_time[t] > self.alert_cooldown:
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