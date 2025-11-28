
"""
ai_worker/inference/incident_detector.py - ENHANCED VERSION
Improved incident detection with:
- Temporal persistence (reduce false positives)
- Multi-frame validation
- Confidence scoring
- Better thresholds
"""
import numpy as np
from collections import deque, defaultdict
import time
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class IncidentDetector:
    """
    Advanced incident detection with temporal tracking
    Detects: Falls, Violence, Theft, Intrusion, Loitering, Health Emergencies
    
    IMPROVEMENTS:
    - Requires multiple consecutive frames to confirm incident
    - Tracks confidence over time
    - Reduces false positives with stricter thresholds
    """
    
    def __init__(self, camera_id: str, alert_cooldown: float = 10.0):
        """
        Initialize incident detector
        
        Args:
            camera_id: Camera identifier
            alert_cooldown: Minimum seconds between same incident type alerts (increased to 10s)
        """
        self.camera_id = camera_id
        
        # Tracking history (increased to 60 frames for better temporal context)
        self.person_history = deque(maxlen=60)
        
        # Incident cooldown (prevent spam)
        self.last_alert_time = {}
        self.alert_cooldown = alert_cooldown
        
        # Temporal trackers for multi-frame validation
        self.fall_candidates = defaultdict(lambda: {'count': 0, 'max_conf': 0.0, 'frames': []})
        self.violence_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        self.theft_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        self.intrusion_candidates = defaultdict(lambda: {'count': 0, 'frames': []})
        self.stationary_persons = {}  # bbox_key -> frame_count
        self.horizontal_person_count = {}  # bbox_key -> consecutive_frames
        
        # Thresholds for multi-frame validation
        self.FALL_CONFIRMATION_FRAMES = 5  # Need 5 consecutive frames
        self.VIOLENCE_CONFIRMATION_FRAMES = 10  # Need 10 frames in 30-frame window
        self.THEFT_CONFIRMATION_FRAMES = 15  # Need 15 frames
        self.INTRUSION_CONFIRMATION_FRAMES = 8  # Need 8 frames
        self.LOITERING_FRAMES = 60  # 60 frames (~1 minute at 1 FPS)
        self.HEALTH_EMERGENCY_FRAMES = 15  # 15 consecutive frames

        # Confidence thresholds (can be relaxed for debugging)
        # Align defaults to the detector.predict(conf=0.6) used in the worker
        self.MIN_CONF_PERSON = 0.6
        self.MIN_CONF_VALUABLE = 0.5

        # If INCIDENT_DEBUG=1 is set in env, relax thresholds for easier testing
        try:
            if os.getenv("INCIDENT_DEBUG", "0") == "1":
                logger.info("INCIDENT_DEBUG=1 enabled: relaxing confirmation thresholds and confidences")
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

        logger.info(f"IncidentDetector initialized for {camera_id} (Enhanced Mode)")
    
    def analyze_frame(self, detections: list, frame: np.ndarray, frame_number: int) -> list:
        """
        Analyze current frame for incidents with multi-frame validation
        
        Args:
            detections: List of YOLO detections from current frame
            frame: Current frame (numpy array)
            frame_number: Frame index
            
        Returns:
            List of confirmed incident dictionaries
        """
        incidents = []
        current_time = time.time()
        
        # Store current detections in history
        self.person_history.append(detections)
        
        # Get frame dimensions
        frame_height, frame_width = frame.shape[:2]
        
        # Run all detection types with confirmation
        incidents.extend(self._detect_falls_confirmed(detections, frame, current_time, frame_number))
        incidents.extend(self._detect_violence_confirmed(detections, frame, current_time, frame_number))
        incidents.extend(self._detect_theft_confirmed(detections, frame, current_time, frame_number))
        incidents.extend(self._detect_intrusion_confirmed(detections, frame, current_time, frame_number))
        incidents.extend(self._detect_loitering(detections, frame, current_time))
        incidents.extend(self._detect_health_emergency_confirmed(detections, frame, current_time, frame_number))
        
        # Cleanup old candidates
        self._cleanup_old_candidates(frame_number)
        
        return incidents
    
    def _detect_falls_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        """
        Detect falls with multi-frame confirmation
        Requires 5 consecutive frames with aspect ratio < 0.6 (stricter threshold)
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        current_fall_keys = set()
        
        for person in persons:
            bbox = person['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            
            if width > 0 and height > 0:
                aspect_ratio = height / width
                
                # Stricter threshold: 0.6 instead of 0.7
                if aspect_ratio < 0.6 and person['conf'] > self.MIN_CONF_PERSON:  # Higher confidence required
                    # Create position key
                    bbox_key = f"{int(bbox[0]/20)*20}_{int(bbox[1]/20)*20}"
                    current_fall_keys.add(bbox_key)
                    
                    # Update candidate
                    self.fall_candidates[bbox_key]['count'] += 1
                    self.fall_candidates[bbox_key]['max_conf'] = max(
                        self.fall_candidates[bbox_key]['max_conf'],
                        person['conf']
                    )
                    self.fall_candidates[bbox_key]['frames'].append(frame_number)
                    
                    # Confirm if sustained for required frames
                    if self.fall_candidates[bbox_key]['count'] >= self.FALL_CONFIRMATION_FRAMES:
                        if self._check_cooldown('fall', current_time):
                            incidents.append({
                                'type': 'fall_detected',
                                'severity': 'critical',  # Upgraded to critical
                                'confidence': self.fall_candidates[bbox_key]['max_conf'],
                                'description': f'Person in horizontal position for {self.fall_candidates[bbox_key]["count"]} consecutive frames (CONFIRMED FALL)',
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
        """
        Detect violence with multi-frame confirmation
        Requires 10 frames of close proximity within 30-frame window
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        if len(persons) >= 2:
            # Check all pairs
            for i, p1 in enumerate(persons):
                for p2 in persons[i+1:]:
                    distance = self._calculate_distance(p1['bbox'], p2['bbox'])
                    
                    # Stricter proximity threshold: 40px instead of 50px
                    if distance < 40 and p1['conf'] > self.MIN_CONF_PERSON and p2['conf'] > self.MIN_CONF_PERSON:
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
                                    'description': f'{len(persons)} people in close proximity for {len(self.violence_candidates[pair_key]["frames"])} frames (CONFIRMED ALTERCATION)',
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
                                break
        
        return incidents
    
    def _detect_theft_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        """
        Detect theft with multi-frame confirmation
        Requires person near valuable for 15+ frames
        """
        incidents = []
        
        valuable_objects = ['backpack', 'handbag', 'suitcase', 'laptop', 'cell phone']
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > self.MIN_CONF_PERSON]
        valuables = [d for d in detections if d['class_name'] in valuable_objects and d['conf'] > self.MIN_CONF_VALUABLE]
        
        if len(persons) > 0 and len(valuables) > 0:
            for person in persons:
                for valuable in valuables:
                    distance = self._calculate_distance(person['bbox'], valuable['bbox'])
                    
                    # Closer proximity: 80px instead of 100px
                    if distance < 80:
                        # Create pair key
                        theft_key = f"theft_{int(person['bbox'][0])}_{valuable['class_name']}"
                        
                        self.theft_candidates[theft_key]['count'] += 1
                        self.theft_candidates[theft_key]['frames'].append(frame_number)
                        
                        # Confirm if sustained
                        if self.theft_candidates[theft_key]['count'] >= self.THEFT_CONFIRMATION_FRAMES:
                            if self._check_cooldown('theft', current_time):
                                incidents.append({
                                    'type': 'potential_theft',
                                    'severity': 'high',  # Upgraded severity
                                    'confidence': 0.75,  # Higher base confidence
                                    'description': f'Person near {valuable["class_name"]} for {self.theft_candidates[theft_key]["count"]} frames at {distance:.0f}px (SUSTAINED INTERACTION)',
                                    'camera_id': self.camera_id,
                                    'timestamp': current_time,
                                    'object': valuable['class_name'],
                                    'distance': distance,
                                    'frame_count': self.theft_candidates[theft_key]['count']
                                })
                                self.last_alert_time['theft'] = current_time
                                
                                del self.theft_candidates[theft_key]
                                
                                logger.warning(f"🚨 POTENTIAL THEFT on {self.camera_id}")
                                break
        
        return incidents
    
    def _detect_intrusion_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        """
        Detect intrusion with multi-frame confirmation
        Requires person in restricted zone for 8+ frames
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > self.MIN_CONF_PERSON]
        
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
                            'description': f'Person in restricted area for {self.intrusion_candidates[intrusion_key]["count"]} frames (CONFIRMED INTRUSION)',
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
        """
        Detect loitering (person stationary for 60+ frames)
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > self.MIN_CONF_PERSON]
        
        current_keys = set()
        
        for person in persons:
            bbox = person['bbox']
            bbox_key = f"{int(bbox[0]/15)*15}_{int(bbox[1]/15)*15}"  # Tighter grid
            current_keys.add(bbox_key)
            
            if bbox_key not in self.stationary_persons:
                self.stationary_persons[bbox_key] = 1
            else:
                self.stationary_persons[bbox_key] += 1
            
            # Increased threshold
            if self.stationary_persons[bbox_key] > self.LOITERING_FRAMES:
                if self._check_cooldown('loitering', current_time):
                    incidents.append({
                        'type': 'loitering',
                        'severity': 'medium',
                        'confidence': 0.8,
                        'description': f'Person loitering for {self.stationary_persons[bbox_key]} frames (~{self.stationary_persons[bbox_key]}s)',
                        'camera_id': self.camera_id,
                        'timestamp': current_time,
                        'duration_frames': self.stationary_persons[bbox_key]
                    })
                    self.last_alert_time['loitering'] = current_time
                    logger.info(f"⚠️ LOITERING detected on {self.camera_id}")
        
        # Cleanup
        keys_to_remove = [k for k in self.stationary_persons.keys() if k not in current_keys]
        for key in keys_to_remove:
            del self.stationary_persons[key]
        
        return incidents
    
    def _detect_health_emergency_confirmed(self, detections: list, frame: np.ndarray, current_time: float, frame_number: int) -> list:
        """
        Detect health emergency (horizontal person on ground for 15+ consecutive frames)
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > self.MIN_CONF_PERSON]
        
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
                                'description': f'Person motionless on ground for {self.horizontal_person_count[bbox_key]} consecutive frames - MEDICAL EMERGENCY SUSPECTED',
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
        """Calculate center-to-center distance between two bounding boxes"""
        center1_x = (bbox1[0] + bbox1[2]) / 2
        center1_y = (bbox1[1] + bbox1[3]) / 2
        center2_x = (bbox2[0] + bbox2[2]) / 2
        center2_y = (bbox2[1] + bbox2[3]) / 2
        
        distance = np.sqrt((center1_x - center2_x)**2 + (center1_y - center2_y)**2)
        return distance
    
    def _check_cooldown(self, incident_type: str, current_time: float) -> bool:
        """Check if enough time has passed since last alert of this type"""
        if incident_type not in self.last_alert_time:
            return True
        
        time_since_last = current_time - self.last_alert_time[incident_type]
        return time_since_last > self.alert_cooldown
    
    def _cleanup_old_candidates(self, current_frame: int):
        """Clean up candidates that haven't been updated recently"""
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
        """Reset all trackers"""
        self.person_history.clear()
        self.last_alert_time.clear()
        self.fall_candidates.clear()
        self.violence_candidates.clear()
        self.theft_candidates.clear()
        self.intrusion_candidates.clear()
        self.stationary_persons.clear()
        self.horizontal_person_count.clear()
        logger.info(f"IncidentDetector reset for {self.camera_id}")