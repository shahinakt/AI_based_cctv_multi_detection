from collections import defaultdict, deque
import numpy as np
import time
import logging
from ai_worker.models.pose_estimator import PoseEstimator

logger = logging.getLogger(__name__)


MATCH_RADIUS_NORMAL  = 120   # px — was 60; wider so fast movement stays tracked
TRACK_MAX_AGE        = 6     # frames — keep track alive through MediaPipe dropouts
MIN_CONF_POSE        = 0.25  # was 0.3
MIN_KP_FALL          = 13    # minimum for fall (hips at index 23/24)
MIN_HISTORY_ATTACK   = 5     # continuous frames needed for slap/strike
MIN_HISTORY_FALL     = 6     # continuous frames needed for fall (was 8)
PROX_VIOLENCE_FRAMES = 6     # consecutive close frames before firing (was 2)


class IncidentDetector:

    def __init__(self, camera_id: str, alert_cooldown: float = 2.0):
        self.camera_id = camera_id
        self.alert_cooldown = alert_cooldown
        self.last_alert_time = {}

        self.pose_estimator = PoseEstimator(use_mediapipe=True)

        self.person_tracks: dict = {}
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

        logger.info(f"IncidentDetector initialized for {camera_id}")

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
        incidents += self._detect_fall(tracked_people, frame, current_time)
        incidents += self._detect_intrusion(tracked_people, current_time)
        incidents += self._detect_theft(detections, current_time)
        incidents += self._detect_proximity_violence(tracked_people, current_time)

        return self._apply_cooldown(incidents, current_time)

    # =========================================================
    # SAFE PERSON TRACKING
    # =========================================================
    def _update_person_tracking(self, poses):
        """
        Age existing tracks first. If they exceed TRACK_MAX_AGE without a
        detection they are pruned. Otherwise they SURVIVE through MediaPipe
        dropouts so history length keeps growing.
        """
        # Age all tracks; prune stale ones
        for pid in list(self.person_tracks.keys()):
            self.person_tracks[pid]["age"] += 1
            if self.person_tracks[pid]["age"] > TRACK_MAX_AGE:
                del self.person_tracks[pid]

        matched_pids = set()

        for pose in poses:
            if pose.get("conf", 0) < MIN_CONF_POSE:
                continue

            num_kp    = pose.get("num_keypoints", 0)
            keypoints = pose.get("keypoints")

            if num_kp < MIN_KP_FALL or not keypoints:
                continue

            # Derive bbox if missing
            bbox = pose.get("bbox")
            if not bbox or len(bbox) != 4:
                visible = [(kp[0], kp[1]) for kp in keypoints
                           if len(kp) >= 3 and kp[2] > 0.2]
                if not visible:
                    continue
                xs, ys = [p[0] for p in visible], [p[1] for p in visible]
                bbox   = [min(xs), min(ys), max(xs), max(ys)]

            center = self._center(bbox)

            # Match to nearest existing track within MATCH_RADIUS_NORMAL
            best_pid, best_dist = None, MATCH_RADIUS_NORMAL
            for pid, track in self.person_tracks.items():
                if pid in matched_pids:
                    continue
                d = self._distance(center, track["center"])
                if d < best_dist:
                    best_dist, best_pid = d, pid

            if best_pid is None:
                best_pid = self.person_id_counter
                self.person_id_counter += 1
                self.person_tracks[best_pid] = {
                    "history": deque(maxlen=20),
                    "center":  center,
                    "age":     0,
                    "min_kp":  num_kp,
                }

            matched_pids.add(best_pid)
            track           = self.person_tracks[best_pid]
            track["center"] = center
            track["age"]    = 0
            track["min_kp"] = min(track["min_kp"], num_kp)
            track["history"].append({
                "bbox":      bbox,
                "center":    center,
                "keypoints": keypoints,
                "num_kp":    num_kp,
            })

        return [(pid, t["history"]) for pid, t in self.person_tracks.items()
                if len(t["history"]) > 0]

    # =========================================================
    # ATTACK DETECTION  — FIX B, FIX E
    # =========================================================
    def _detect_attack(self, tracked_people, current_time):
        incidents = []

        for i in range(len(tracked_people)):
            id1, hist1 = tracked_people[i]
            if len(hist1) < MIN_HISTORY_ATTACK:
                continue

            for j in range(i + 1, len(tracked_people)):
                id2, hist2 = tracked_people[j]
                if len(hist2) < 2:
                    continue

                dist   = self._distance(hist1[-1]["center"], hist2[-1]["center"])
                body_h = hist1[-1]["bbox"][3] - hist1[-1]["bbox"][1]
                if body_h <= 0 or dist > body_h * 2.5:
                    continue

                if self._check_slap(hist1, hist2, body_h):
                    incidents.append({
                        "type":        "slap_detected",
                        "severity":    "high",
                        "confidence":  0.92,
                        "description": "Aggressive hand strike toward face detected.",
                        "camera_id":   self.camera_id,
                        "timestamp":   current_time,
                    })
                    return incidents

                if self._check_strike(hist1, hist2, body_h):
                    incidents.append({
                        "type":        "strike_detected",
                        "severity":    "high",
                        "confidence":  0.88,
                        "description": "Physical strike or push detected.",
                        "camera_id":   self.camera_id,
                        "timestamp":   current_time,
                    })
                    return incidents

                speed1 = self._body_speed(hist1)
                speed2 = self._body_speed(hist2)
                if speed1 > body_h * 0.02 and speed2 > body_h * 0.02 and dist < body_h:
                    incidents.append({
                        "type":        "fight_detected",
                        "severity":    "high",
                        "confidence":  0.85,
                        "description": "Mutual aggressive motion detected.",
                        "camera_id":   self.camera_id,
                        "timestamp":   current_time,
                    })
                    return incidents

        return incidents

    # =========================================================
    # BODY SPEED CALCULATION
    # =========================================================
    def _body_speed(self, history):
        if len(history) < 3:
            return 0
        recent = list(history)[-3:]
        return max((self._distance(recent[i]["center"], recent[i-1]["center"])
                    for i in range(1, len(recent))), default=0)
        
    def _check_slap(self, hist1, hist2, body_h):
        # FIX B: only frames with >= 17 keypoints (need wrist indices 15/16)
        valid_frames = [f for f in list(hist1)[-8:] if f.get("num_kp", 0) >= 17]
        if len(valid_frames) < MIN_HISTORY_ATTACK:
            return False
        recent = valid_frames[-MIN_HISTORY_ATTACK:]

        speed_thresh = body_h * 0.012
        dist_thresh  = body_h * 0.8

        # FIX E: robust head center using only confident landmarks
        try:
            kp2  = hist2[-1]["keypoints"]
            nose = kp2[0]
            pts  = [(nose[0], nose[1])]
            for idx in (7, 8):   # ears
                if len(kp2) > idx and len(kp2[idx]) >= 3 and kp2[idx][2] > 0.3:
                    pts.append((kp2[idx][0], kp2[idx][1]))
            victim_head = (sum(p[0] for p in pts)/len(pts),
                           sum(p[1] for p in pts)/len(pts))
        except Exception:
            return False

        for wi in (15, 16):
            try:
                wpts = [(f["keypoints"][wi][0], f["keypoints"][wi][1]) for f in recent]
            except (IndexError, KeyError):
                continue
            if len(wpts) < 2:
                continue
            vels = [self._distance(wpts[i], wpts[i-1]) for i in range(1, len(wpts))]
            if not vels or max(vels) < speed_thresh:
                continue
            mv  = (wpts[-1][0]-wpts[-2][0], wpts[-1][1]-wpts[-2][1])
            hv  = (victim_head[0]-wpts[-2][0], victim_head[1]-wpts[-2][1])
            dot = mv[0]*hv[0] + mv[1]*hv[1]
            if dot < -(body_h * 0.02):
                continue
            if self._distance(wpts[-1], victim_head) < dist_thresh:
                return True
        return False

    def _check_strike(self, hist1, hist2, body_h):
        # FIX B: only frames with >= 17 keypoints
        valid_frames = [f for f in list(hist1)[-6:] if f.get("num_kp", 0) >= 17]
        if len(valid_frames) < 4:
            return False
        recent = valid_frames[-4:]

        speed_thresh = body_h * 0.012
        hit_thresh   = body_h * 1.0

        try:
            kp2 = hist2[-1]["keypoints"]
            ls, rs, nose = kp2[11], kp2[12], kp2[0]
            victim_center = ((nose[0]+ls[0]+rs[0])/3, (nose[1]+ls[1]+rs[1])/3)
        except Exception:
            return False

        for wi in (15, 16):
            try:
                wpts = [(f["keypoints"][wi][0], f["keypoints"][wi][1]) for f in recent]
            except (IndexError, KeyError):
                continue
            if len(wpts) < 2:
                continue
            vels = [self._distance(wpts[i], wpts[i-1]) for i in range(1, len(wpts))]
            if not vels or max(vels) < speed_thresh:
                continue
            mv  = (wpts[-1][0]-wpts[-2][0], wpts[-1][1]-wpts[-2][1])
            hv  = (victim_center[0]-wpts[-2][0], victim_center[1]-wpts[-2][1])
            dot = mv[0]*hv[0] + mv[1]*hv[1]
            if dot < -(body_h * 0.02):
                continue
            if self._distance(wpts[-1], victim_center) < hit_thresh:
                return True
        return False

    # =========================================================
    # FALL DETECTION  — FIX C + FIX D
    # =========================================================
    def _detect_fall(self, tracked_people, frame, current_time):
        """
        FIX C: 2-of-3 → high severity, 3-of-3 → critical.
        FIX D: baseline torso = MAX across entire track history.
        """
        incidents = []
        frame_h   = frame.shape[0]

        for pid, history in tracked_people:
            if len(history) < MIN_HISTORY_FALL:
                continue

            hist_list   = list(history)
            recent      = hist_list[-MIN_HISTORY_FALL:]
            y_positions = [f["center"][1] for f in recent]
            bboxes      = [f["bbox"] for f in recent if f.get("bbox")]

            if len(bboxes) < 4:
                continue

            body_h = bboxes[-1][3] - bboxes[-1][1]
            if body_h <= 0:
                continue

            v_speed    = y_positions[-1] - y_positions[-2]
            drop_amt   = max(y_positions) - min(y_positions)
            sudden_drop = (v_speed > body_h * 0.02 and drop_amt > body_h * 0.06)
            near_ground = bboxes[-1][3] > frame_h * 0.80

            # FIX D: torso collapse vs historical maximum
            torso_collapse = False
            try:
                kp_now = recent[-1].get("keypoints", [])
                if len(kp_now) >= 25:
                    sy_now = (kp_now[11][1] + kp_now[12][1]) / 2
                    hy_now = (kp_now[23][1] + kp_now[24][1]) / 2
                    t_now  = abs(hy_now - sy_now)

                    t_history = []
                    for f in hist_list:
                        kp = f.get("keypoints", [])
                        if len(kp) >= 25:
                            sy = (kp[11][1]+kp[12][1])/2
                            hy = (kp[23][1]+kp[24][1])/2
                            t_history.append(abs(hy-sy))

                    if t_history:
                        t_max = max(t_history)
                        torso_collapse = t_now < t_max * 0.55 and t_max > 10
            except Exception:
                pass

            conditions = sum([sudden_drop, near_ground, torso_collapse])

            if conditions >= 3:
                incidents.append({
                    "type":        "fall_detected",
                    "severity":    "critical",
                    "confidence":  0.92,
                    "description": "Confirmed fall: rapid drop + near ground + torso collapse.",
                    "camera_id":   self.camera_id,
                    "timestamp":   current_time,
                })
            elif conditions >= 2:
                incidents.append({
                    "type":        "fall_detected",
                    "severity":    "high",
                    "confidence":  0.72,
                    "description": "Possible fall (2 of 3 indicators active).",
                    "camera_id":   self.camera_id,
                    "timestamp":   current_time,
                    
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

        
    def _detect_proximity_violence(self, tracked_people, current_time):
        incidents = []
        for i in range(len(tracked_people)):
            for j in range(i+1, len(tracked_people)):
                id1, hist1 = tracked_people[i]
                id2, hist2 = tracked_people[j]
                if not hist1 or not hist2:
                    continue
                dist = self._distance(hist1[-1]["center"], hist2[-1]["center"])
                key  = (min(id1,id2), max(id1,id2))
                if dist < 140:
                    self.violence_pairs[key] += 1
                else:
                    self.violence_pairs[key] = max(0, self.violence_pairs[key]-1)
                if self.violence_pairs[key] >= PROX_VIOLENCE_FRAMES:
                    incidents.append({
                        "type":        "violence_detected",
                        "severity":    "high",
                        "confidence":  0.85,
                        "description": "Sustained close-range aggression detected.",
                        "camera_id":   self.camera_id,
                        "timestamp":   current_time,
                    })
                    self.violence_pairs[key] = 0
        return incidents

    def _distance(self, p1, p2):
        return float(np.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2))

    def _center(self, bbox):
        return ((bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2)

    def _apply_cooldown(self, incidents, current_time):
        out = []
        for inc in incidents:
            t = inc["type"]
            if (t not in self.last_alert_time
                    or current_time - self.last_alert_time[t] > self.alert_cooldown):
                self.last_alert_time[t] = current_time
                out.append(inc)
        return out

    def reset(self):
        self.person_tracks.clear()
        self.object_tracks.clear()
        self.object_missing_frames.clear()
        self.object_stationary_frames.clear()
        self.violence_pairs.clear()
        self.last_alert_time.clear()
        self.intrusion_memory.clear()