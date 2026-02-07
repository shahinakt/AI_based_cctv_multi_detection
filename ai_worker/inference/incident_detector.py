
"""
ai_worker/inference/incident_detector.py - ENHANCED VERSION
Improved incident detection with:
"""
from collections import deque, defaultdict
import os
import time
import numpy as np
import logging

# Import PoseEstimator from models
from ai_worker.models.pose_estimator import PoseEstimator

logger = logging.getLogger(__name__)

class IncidentDetector:
    def __init__(self, camera_id: str, alert_cooldown: float = 10.0):
        self.camera_id = camera_id
        self.alert_cooldown = alert_cooldown  # Store alert cooldown
        self.last_alert_time = {}

        # Initialize confidence thresholds early (needed by detection methods)
        self.MIN_CONF_PERSON = 0.6
        self.MIN_CONF_VALUABLE = 0.5
        
        # Thresholds for multi-frame validation  
        self.FALL_CONFIRMATION_FRAMES = 5
        self.VIOLENCE_CONFIRMATION_FRAMES = 10
        self.THEFT_CONFIRMATION_FRAMES = 15
        self.INTRUSION_CONFIRMATION_FRAMES = 8
        self.LOITERING_FRAMES = 60
        self.HEALTH_EMERGENCY_FRAMES = 15
        
        # If INCIDENT_DEBUG=1, relax thresholds for easier testing
        try:
            if os.getenv("INCIDENT_DEBUG", "0") == "1":
                logger.info("INCIDENT_DEBUG=1 enabled: relaxing thresholds")
                self.FALL_CONFIRMATION_FRAMES = 2
                self.VIOLENCE_CONFIRMATION_FRAMES = 3
                self.THEFT_CONFIRMATION_FRAMES = 3
                self.INTRUSION_CONFIRMATION_FRAMES = 2
                self.LOITERING_FRAMES = 10
                self.HEALTH_EMERGENCY_FRAMES = 3
                self.MIN_CONF_PERSON = 0.45
                self.MIN_CONF_VALUABLE = 0.4
        except Exception:
            pass

        # Initialize pose estimator (MediaPipe)
        self.pose_estimator = PoseEstimator(use_mediapipe=True)
        
        # Initialize person tracking history
        self.person_history = deque(maxlen=60)
        
        # Initialize tracking dictionaries
        self.fall_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        self.violence_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        self.theft_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        self.intrusion_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        self.stationary_persons = defaultdict(lambda: {'count': 0, 'frames': []})
        self.horizontal_person_count = defaultdict(lambda: {'count': 0, 'frames': []})
        
        # Initialize object tracking attributes
        self.object_owners = {}
        self.last_object_positions = {}
        self.last_seen_objects = set()
        
        logger.info(f"IncidentDetector initialized for {camera_id} (Enhanced Mode)")

    def _detect_theft_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        """
        Detect theft with multi-frame confirmation and ownership tracking.
        If a valuable object is removed by a non-owner, raise an incident.
        """
        # Helper for centroid
        def get_centroid(bbox):
            return ((bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2)

        # Define valuable object classes
        valuable_objects = [
            'cell phone', 'laptop', 'wallet', 'bag', 'purse', 'tablet', 'camera',
            'backpack', 'handbag', 'suitcase', 'book'
        ]
        persons = [d for d in detections if d['class_name'] == 'person']
        valuables = [d for d in detections if d['class_name'] in valuable_objects and d['conf'] > getattr(self, 'MIN_CONF_VALUABLE', 0.5)]
        incidents = []

        # Track objects and assign owners
        if not hasattr(self, 'object_owners'):
            self.object_owners = {}
        if not hasattr(self, 'last_object_positions'):
            self.last_object_positions = {}
        if not hasattr(self, 'last_seen_objects'):
            self.last_seen_objects = set()

        current_object_ids = set()
        for valuable in valuables:
            obj_centroid = get_centroid(valuable['bbox'])
            obj_id = f"{valuable['class_name']}_{obj_centroid[0]}_{obj_centroid[1]}"
            current_object_ids.add(obj_id)
            self.last_object_positions[obj_id] = obj_centroid

            # If new object, assign owner as nearest person
            if obj_id not in self.object_owners:
                min_dist = float('inf')
                owner_id = None
                for person in persons:
                    person_centroid = get_centroid(person['bbox'])
                    dist = np.linalg.norm(np.array(obj_centroid) - np.array(person_centroid))
                    if dist < min_dist:
                        min_dist = dist
                        owner_id = f"person_{person_centroid[0]}_{person_centroid[1]}"
                if owner_id is not None:
                    self.object_owners[obj_id] = owner_id

        # Detect object removal by non-owner
        removed_objects = self.last_seen_objects - current_object_ids
        for obj_id in removed_objects:
            # Only trigger if owner is known
            owner_id = self.object_owners.get(obj_id)
            # Find nearest person to last known position
            last_pos = self.last_object_positions.get(obj_id)
            min_dist = float('inf')
            thief_id = None
            for person in persons:
                person_centroid = get_centroid(person['bbox'])
                dist = np.linalg.norm(np.array(last_pos) - np.array(person_centroid))
                if dist < min_dist:
                    min_dist = dist
                    thief_id = f"person_{person_centroid[0]}_{person_centroid[1]}"
            # If nearest person is not the owner, raise incident
            if thief_id is not None and thief_id != owner_id:
                self.theft_candidates[obj_id]['count'] += 1
                self.theft_candidates[obj_id]['frames'].append(frame_number)
                if self.theft_candidates[obj_id]['count'] >= self.THEFT_CONFIRMATION_FRAMES:
                    if self._check_cooldown('theft', current_time):
                        incidents.append({
                            'type': 'theft_detected',
                            'severity': 'high',
                            'confidence': 0.9,
                            'description': (
                                f"Theft detected: {obj_id} was removed by a non-owner (possible thief: {thief_id})."
                            ),
                            'camera_id': self.camera_id,
                            'timestamp': current_time,
                            'object': obj_id,
                            'owner': owner_id,
                            'thief': thief_id,
                            'frame_count': self.theft_candidates[obj_id]['count']
                        })
                        self.last_alert_time['theft'] = current_time
                        del self.theft_candidates[obj_id]
                        logger.warning(f"🚨 THEFT DETECTED: {obj_id} by {thief_id} (owner: {owner_id}) on {self.camera_id}")
            else:
                # Reset candidate if owner took it or no one nearby
                if obj_id in self.theft_candidates:
                    del self.theft_candidates[obj_id]
            # Clean up
            if obj_id in self.object_owners:
                del self.object_owners[obj_id]
            if obj_id in self.last_object_positions:
                del self.last_object_positions[obj_id]

        self.last_seen_objects = current_object_ids
        return incidents
        
    def analyze_frame(self, detections: list, frame: np.ndarray, frame_number: int) -> list:
        """
        Analyze current frame for incidents with multi-frame validation
        
        Args:
            detections: List of YOLO detections from current frame
            frame: Current frame (numpy array)
            frame_number: Current frame number
        """
        # Defensive: ensure pose_estimator is always available
        if not hasattr(self, 'pose_estimator') or self.pose_estimator is None:
            self.pose_estimator = PoseEstimator(use_mediapipe=True)
        
        # Defensive: ensure all tracking dictionaries exist
        if not hasattr(self, 'intrusion_candidates'):
            self.intrusion_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        if not hasattr(self, 'fall_candidates'):
            self.fall_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        if not hasattr(self, 'violence_candidates'):
            self.violence_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        if not hasattr(self, 'theft_candidates'):
            self.theft_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        if not hasattr(self, 'stationary_persons'):
            self.stationary_persons = defaultdict(lambda: {'count': 0, 'frames': []})
        if not hasattr(self, 'horizontal_person_count'):
            self.horizontal_person_count = defaultdict(lambda: {'count': 0, 'frames': []})
        if not hasattr(self, 'object_owners'):
            self.object_owners = {}
        if not hasattr(self, 'last_object_positions'):
            self.last_object_positions = {}
        if not hasattr(self, 'last_seen_objects'):
            self.last_seen_objects = set()
            
        # Defensive: ensure MIN_CONF constants exist
        self.MIN_CONF_PERSON = getattr(self, 'MIN_CONF_PERSON', 0.5)
        self.MIN_CONF_THEFT = getattr(self, 'MIN_CONF_THEFT', 0.6)
        self.MIN_CONF_VIOLENCE = getattr(self, 'MIN_CONF_VIOLENCE', 0.7)
        self.MIN_CONF_FALL = getattr(self, 'MIN_CONF_FALL', 0.6)
        self.MIN_CONF_INTRUSION = getattr(self, 'MIN_CONF_INTRUSION', 0.6)
        self.MIN_CONF_VALUABLE = getattr(self, 'MIN_CONF_VALUABLE', 0.5)
        
        # Defensive: ensure frame count constants exist
        self.FALL_CONFIRMATION_FRAMES = getattr(self, 'FALL_CONFIRMATION_FRAMES', 5)
        self.VIOLENCE_CONFIRMATION_FRAMES = getattr(self, 'VIOLENCE_CONFIRMATION_FRAMES', 10)
        self.THEFT_CONFIRMATION_FRAMES = getattr(self, 'THEFT_CONFIRMATION_FRAMES', 15)
        self.INTRUSION_CONFIRMATION_FRAMES = getattr(self, 'INTRUSION_CONFIRMATION_FRAMES', 8)
        self.LOITERING_FRAMES = getattr(self, 'LOITERING_FRAMES', 60)
        self.HEALTH_EMERGENCY_FRAMES = getattr(self, 'HEALTH_EMERGENCY_FRAMES', 15)
        
        # Also defensive alert cooldown
        if not hasattr(self, 'alert_cooldown'):
            self.alert_cooldown = {}
            
        incidents = []
        current_time = time.time()
        
        # Get frame dimensions
        frame_height, frame_width = frame.shape[:2]
        
        # Run all detection types with confirmation
        incidents.extend(self._detect_falls_confirmed(detections, frame, current_time, frame_number))
        incidents.extend(self._detect_violence_confirmed(detections, frame, current_time, frame_number))
        # Add pose-based slap detection
        incidents.extend(self._detect_pose_slap(frame, current_time))
        incidents.extend(self._detect_theft_confirmed(detections, frame, current_time, frame_number))
        incidents.extend(self._detect_intrusion_confirmed(detections, frame, current_time, frame_number))
        incidents.extend(self._detect_loitering(detections, frame, current_time))
        incidents.extend(self._detect_health_emergency_confirmed(detections, frame, current_time, frame_number))
        
        # Cleanup old candidates
        self._cleanup_old_candidates(frame_number)
        
        return incidents

    def _detect_pose_slap(self, frame: np.ndarray, current_time: float) -> list:
        """
        Detect slap-like gesture using pose estimation (right wrist moves fast toward head).
        """
        incidents = []
        # Use pose estimator to get keypoints
        poses = self.pose_estimator.estimate(frame)
        if not hasattr(self, '_prev_wrist_xy'):
            self._prev_wrist_xy = None
        if not hasattr(self, '_slap_cooldown'):
            self._slap_cooldown = 0
        # Only process first pose (single person)
        if poses and poses[0]['num_keypoints'] >= 10:
            keypoints = poses[0]['keypoints']
            # MediaPipe: 16=right wrist, 0=nose
            wrist = keypoints[16]
            nose = keypoints[0]
            wrist_xy = np.array([wrist[0], wrist[1]])
            nose_xy = np.array([nose[0], nose[1]])
            # Check for fast movement toward head
            if self._prev_wrist_xy is not None:
                move_vec = wrist_xy - self._prev_wrist_xy
                speed = np.linalg.norm(move_vec)
                to_head = np.linalg.norm(wrist_xy - nose_xy)
                if speed > 30 and to_head < 80 and (current_time - self._slap_cooldown > 2):
                    incidents.append({
                        'type': 'pose_slap',
                        'severity': 'medium',
                        'confidence': poses[0]['conf'],
                        'description': 'Possible SLAP detected by pose estimation (right wrist fast toward head).',
                        'camera_id': self.camera_id,
                        'timestamp': current_time
                    })
                    self._slap_cooldown = current_time
            self._prev_wrist_xy = wrist_xy
        return incidents
    

    def _detect_falls_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        # Stricter fall detection: tighter aspect ratio and pose-based confirmation
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        frame_height, frame_width = frame.shape[:2]
        current_fall_keys = set()
        # Get pose estimation for the frame (if available)
        poses = self.pose_estimator.estimate(frame) if hasattr(self, 'pose_estimator') else []
        for person in persons:
            bbox = person['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            if width > 0 and height > 0:
                aspect_ratio = height / width
                # Make aspect ratio stricter (e.g., < 0.5)
                is_horizontal = aspect_ratio < 0.5
                is_on_ground = bbox[3] > frame_height * 0.85  # Stricter ground detection
                pose_confirms_fall = False
                # Pose-based check: shoulders and hips close to ground, torso horizontal
                if poses and poses[0]['num_keypoints'] >= 24:
                    keypoints = poses[0]['keypoints']
                    # MediaPipe: 11=left_shoulder, 12=right_shoulder, 23=left_hip, 24=right_hip
                    y_shoulder = (keypoints[11][1] + keypoints[12][1]) / 2
                    y_hip = (keypoints[23][1] + keypoints[24][1]) / 2
                    # Both shoulders and hips near bottom of frame
                    if y_shoulder > frame_height * 0.75 and y_hip > frame_height * 0.8:
                        # Torso horizontal: y difference between shoulders and hips is small
                        if abs(y_shoulder - y_hip) < frame_height * 0.15:
                            pose_confirms_fall = True
                if is_horizontal and is_on_ground and pose_confirms_fall:
                    bbox_key = f"{int(bbox[0]/20)*20}_{int(bbox[1]/20)*20}"
                    current_fall_keys.add(bbox_key)
                    self.fall_candidates[bbox_key]['count'] += 1
                    self.fall_candidates[bbox_key]['max_conf'] = max(
                        self.fall_candidates[bbox_key]['max_conf'],
                        person['conf']
                    )
                    self.fall_candidates[bbox_key]['frames'].append(frame_number)
                    if self.fall_candidates[bbox_key]['count'] >= self.FALL_CONFIRMATION_FRAMES:
                        if self._check_cooldown('fall', current_time):
                            incidents.append({
                                'type': 'fall_detected',
                                'severity': 'critical',
                                'confidence': self.fall_candidates[bbox_key]['max_conf'],
                                'description': (
                                    f"A person suddenly collapsed and has been lying on the ground for "
                                    f"{self.fall_candidates[bbox_key]['count']} consecutive frames. "
                                    f"This may indicate a fall."
                                ),
                                'camera_id': self.camera_id,
                                'bbox': bbox,
                                'timestamp': current_time,
                                'aspect_ratio': aspect_ratio,
                                'frame_count': self.fall_candidates[bbox_key]['count']
                            })
                            self.last_alert_time['fall'] = current_time
                            # Reset candidate after alert
                            del self.fall_candidates[bbox_key]
                            logger.warning(f"🚨 CONFIRMED FALL DETECTED on {self.camera_id}")
        # Cleanup candidates not seen this frame
        for key in list(self.fall_candidates.keys()):
            if key not in current_fall_keys:
                # Reset if interrupted
                del self.fall_candidates[key]
        return incidents
    
    def _detect_violence_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        # Detect violence with multi-frame confirmation. Requires 10 frames of close proximity within 30-frame window.
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        if len(persons) >= 2:
            # Check all pairs
            for i, p1 in enumerate(persons):
                for p2 in persons[i+1:]:
                    distance = self._calculate_distance(p1['bbox'], p2['bbox'])
                    
                    # Stricter proximity threshold: 40px instead of 50px
                    if distance < 40 and p1['conf'] > getattr(self, 'MIN_CONF_PERSON', 0.6) and p2['conf'] > getattr(self, 'MIN_CONF_PERSON', 0.6):
                        # Create pair key
                        pair_key = f"violence_{min(int(p1['bbox'][0]), int(p2['bbox'][0]))}"
                        
                        # Track this candidate
                        self.violence_candidates[pair_key]['count'] += 1
                        self.violence_candidates[pair_key]['frames'].append(frame_number)
                        
                        # Keep only recent frames (30-frame window)
                        self.violence_candidates[pair_key]['frames'] = [
                            f for f in self.violence_candidates[pair_key]['frames']
                            if frame_number - f < 30
                        ]
                        
                        # Confirm if enough frames in window
                        if len(self.violence_candidates[pair_key]['frames']) >= self.VIOLENCE_CONFIRMATION_FRAMES:
                            if self._check_cooldown('violence', current_time):
                                incidents.append({
                                    'type': 'potential_violence',
                                    'severity': 'high',
                                    'confidence': min(p1['conf'], p2['conf']),
                                    'description': (
                                        f"Physical altercation detected: {len(persons)} people were engaged in rapid, close, and forceful movements for "
                                        f"{len(self.violence_candidates[pair_key]['frames'])} consecutive frames. This may indicate a fight or violent behavior."
                                    ),
                                    'camera_id': self.camera_id,
                                    'timestamp': current_time,
                                    'num_people': len(persons),
                                    'distance': distance,
                                    'frame_count': len(self.violence_candidates[pair_key]['frames'])
                                })
                                self.last_alert_time['violence'] = current_time
                                
                                # Reset candidate
                                del self.violence_candidates[pair_key]
                                
                                logger.warning(f"🚨 CONFIRMED VIOLENCE on {self.camera_id}")
        
        return incidents
        # Helper function for centroid
        def get_centroid(bbox):
            return ((bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2)
        # Define valuable object classes
        valuable_objects = ['cell phone', 'laptop', 'wallet', 'bag', 'purse', 'tablet', 'camera', 'backpack', 'handbag', 'suitcase', 'book']
        persons = [d for d in detections if d['class_name'] == 'person']
        valuables = [d for d in detections if d['class_name'] in valuable_objects and d['conf'] > getattr(self, 'MIN_CONF_VALUABLE', 0.5)]
        incidents = []
        # Track objects and assign owners
        current_object_ids = set()
        for valuable in valuables:
            obj_centroid = get_centroid(valuable['bbox'])
            obj_id = f"{valuable['class_name']}_{obj_centroid[0]}_{obj_centroid[1]}"
            current_object_ids.add(obj_id)
            self.last_object_positions[obj_id] = obj_centroid

            # If new object, assign owner as nearest person
            if obj_id not in self.object_owners:
                min_dist = float('inf')
                owner_id = None
                for person in persons:
                    person_centroid = get_centroid(person['bbox'])
                    dist = np.linalg.norm(np.array(obj_centroid) - np.array(person_centroid))
                    if dist < min_dist:
                        min_dist = dist
                        owner_id = f"person_{person_centroid[0]}_{person_centroid[1]}"

        # Detect object removal by non-owner

                incidents.append({
                    'severity': 'high',
                    'confidence': 0.85,
                    'camera_id': self.camera_id,
                    'timestamp': current_time,
                    'object': obj_id,
                    'distance': min_dist,
                    'frame_count': 1
                })
                # Clean up
                if obj_id in self.object_owners:
                    del self.object_owners[obj_id]
                if obj_id in self.last_object_positions:
                    del self.last_object_positions[obj_id]

        self.last_seen_objects = current_object_ids

        return incidents
    
    def _detect_intrusion_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        # Detect intrusion with multi-frame confirmation. Requires person in restricted zone for 8+ frames.
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > getattr(self, 'MIN_CONF_PERSON', 0.6)]
        
        frame_height, frame_width = frame.shape[:2]
        
        # Define restricted zone (bottom-right quadrant)
        restricted_zone = {
            'x_min': frame_width * 0.7,
            'x_max': frame_width,
            'y_min': frame_height * 0.7,
            'y_max': frame_height
        }
        
        current_intrusion_keys = set()
        
        for person in persons:
            bbox = person['bbox']
            person_center_x = (bbox[0] + bbox[2]) / 2
            person_center_y = (bbox[1] + bbox[3]) / 2
            
            in_zone = (
                restricted_zone['x_min'] < person_center_x < restricted_zone['x_max'] and
                restricted_zone['y_min'] < person_center_y < restricted_zone['y_max']
            )
            
            if in_zone:
                intrusion_key = f"intrusion_{int(person_center_x/20)*20}"
                current_intrusion_keys.add(intrusion_key)
                
                self.intrusion_candidates[intrusion_key]['count'] += 1
                self.intrusion_candidates[intrusion_key]['frames'].append(frame_number)
                
                if self.intrusion_candidates[intrusion_key]['count'] >= self.INTRUSION_CONFIRMATION_FRAMES:
                    if self._check_cooldown('intrusion', current_time):
                        incidents.append({
                            'type': 'intrusion',
                            'severity': 'high',
                            'confidence': person['conf'],
                            'description': (
                                f"Intrusion detected: A person entered a restricted area and remained there for "
                                f"{self.intrusion_candidates[intrusion_key]['count']} consecutive frames."
                            ),
                            'camera_id': self.camera_id,
                            'timestamp': current_time,
                            'position': (person_center_x, person_center_y),
                            'frame_count': self.intrusion_candidates[intrusion_key]['count']
                        })
                        self.last_alert_time['intrusion'] = current_time
                        
                        del self.intrusion_candidates[intrusion_key]
                        
                        logger.warning(f"🚨 INTRUSION on {self.camera_id}")
        
        # Cleanup
        for key in list(self.intrusion_candidates.keys()):
            if key not in current_intrusion_keys:
                del self.intrusion_candidates[key]
        
        return incidents
    
    def _detect_loitering(self, detections: list, frame: np.ndarray, current_time: float) -> list:
        # Detect loitering (person stationary for 60+ frames).
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > getattr(self, 'MIN_CONF_PERSON', 0.6)]
        
        current_keys = set()
        
        for person in persons:
            bbox = person['bbox']
            bbox_key = f"{int(bbox[0]/15)*15}_{int(bbox[1]/15)*15}"  # Tighter grid
            current_keys.add(bbox_key)
            
            if bbox_key not in self.stationary_persons:
                self.stationary_persons[bbox_key] = 1
            else:
                self.stationary_persons[bbox_key] += 1
            # If stationary long enough, trigger loitering
            if self.stationary_persons[bbox_key] >= self.LOITERING_FRAMES:
                if self._check_cooldown('loitering', current_time):
                    incidents.append({
                        'type': 'loitering',
                        'severity': 'medium',
                        'confidence': 0.8,
                        'camera_id': self.camera_id,
                        'timestamp': current_time,
                        'duration_frames': self.stationary_persons[bbox_key],
                        'bbox': bbox
                    })
                    self.last_alert_time['loitering'] = current_time
                    logger.info(f"⚠️ LOITERING detected on {self.camera_id}")
        
        # Cleanup
        keys_to_remove = [k for k in self.stationary_persons.keys() if k not in current_keys]
        for key in keys_to_remove:
            del self.stationary_persons[key]
        
        return incidents
    
    def _detect_health_emergency_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        # Detect health emergency (horizontal person on ground for 15+ consecutive frames).
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > getattr(self, 'MIN_CONF_PERSON', 0.6)]
        
        frame_height, frame_width = frame.shape[:2]
        current_horizontal_keys = set()
        
        for person in persons:
            bbox = person['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            
            if width > 0 and height > 0:
                aspect_ratio = height / width
                
                is_horizontal = aspect_ratio < 0.6  # Stricter
                is_on_ground = bbox[3] > frame_height * 0.75  # More lenient ground detection
                
                if is_horizontal and is_on_ground:
                    bbox_key = f"{int(bbox[0]/15)*15}_{int(bbox[1]/15)*15}"
                    current_horizontal_keys.add(bbox_key)
                    
                    if bbox_key not in self.horizontal_person_count:
                        self.horizontal_person_count[bbox_key] = 1
                    else:
                        self.horizontal_person_count[bbox_key] += 1
                    
                    if self.horizontal_person_count[bbox_key] >= self.HEALTH_EMERGENCY_FRAMES:
                        if self._check_cooldown('health_emergency', current_time):
                            incidents.append({
                                'type': 'health_emergency',
                                'severity': 'critical',
                                'confidence': 0.9,
                                'description': (
                                    f"Medical emergency suspected: A person has been motionless and lying on the ground for "
                                    f"{self.horizontal_person_count[bbox_key]} consecutive frames. Immediate attention may be required."
                                ),
                                'camera_id': self.camera_id,
                                'timestamp': current_time,
                                'duration_frames': self.horizontal_person_count[bbox_key],
                                'bbox': bbox
                            })
                            self.last_alert_time['health_emergency'] = current_time
                            logger.error(f"🚨🚨 HEALTH EMERGENCY on {self.camera_id}")
        
        # Cleanup
        keys_to_remove = [k for k in self.horizontal_person_count.keys() if k not in current_horizontal_keys]
        for key in keys_to_remove:
            del self.horizontal_person_count[key]
        
        return incidents
    
    def _calculate_distance(self, bbox1: list, bbox2: list) -> float:
        # Calculate center-to-center distance between two bounding boxes.
        center1_x = (bbox1[0] + bbox1[2]) / 2
        center1_y = (bbox1[1] + bbox1[3]) / 2
        center2_x = (bbox2[0] + bbox2[2]) / 2
        center2_y = (bbox2[1] + bbox2[3]) / 2
        
        distance = np.sqrt((center1_x - center2_x)**2 + (center1_y - center2_y)**2)
        return distance
    
    def _check_cooldown(self, incident_type: str, current_time: float) -> bool:
        """Check if enough time has passed since last alert of this type."""
        # Defensive: Ensure last_alert_time exists
        if not hasattr(self, 'last_alert_time'):
            self.last_alert_time = {}
        
        if incident_type not in self.last_alert_time:
            return True
        
        time_since_last = current_time - self.last_alert_time[incident_type]
        return time_since_last > self.alert_cooldown
    
    def _cleanup_old_candidates(self, current_frame: int):
        # Clean up candidates that haven't been updated recently
        # Cleanup fall candidates
        for key in list(self.fall_candidates.keys()):
            if self.fall_candidates[key]['frames'] and current_frame - self.fall_candidates[key]['frames'][-1] > 10:
                del self.fall_candidates[key]
        
        # Cleanup violence candidates
        for key in list(self.violence_candidates.keys()):
            if self.violence_candidates[key]['frames'] and current_frame - self.violence_candidates[key]['frames'][-1] > 30:
                del self.violence_candidates[key]
        
        # Cleanup theft candidates
        for key in list(self.theft_candidates.keys()):
            if self.theft_candidates[key]['frames'] and current_frame - self.theft_candidates[key]['frames'][-1] > 20:
                del self.theft_candidates[key]
    
    def reset(self):
        # Reset all trackers
        self.person_history.clear()
        self.last_alert_time.clear()
        self.fall_candidates.clear()
        self.violence_candidates.clear()
        self.theft_candidates.clear()
        self.intrusion_candidates.clear()
        self.stationary_persons.clear()
        self.horizontal_person_count.clear()
        logger.info(f"IncidentDetector reset for {self.camera_id}")