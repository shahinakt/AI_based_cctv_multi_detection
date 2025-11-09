# ai_worker/inference/incident_detector.py
import numpy as np
from collections import deque
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class IncidentDetector:
    """
    Advanced incident detection with temporal tracking
    Detects: Falls, Violence, Theft, Intrusion, Loitering, Health Emergencies
    """
    
    def __init__(self, camera_id: str, alert_cooldown: float = 5.0):
        """
        Initialize incident detector
        
        Args:
            camera_id: Camera identifier
            alert_cooldown: Minimum seconds between same incident type alerts
        """
        self.camera_id = camera_id
        
        # Tracking history (last 30 frames)
        self.person_history = deque(maxlen=30)
        self.motion_history = deque(maxlen=30)
        
        # Incident cooldown (prevent spam)
        self.last_alert_time = {}
        self.alert_cooldown = alert_cooldown
        
        # State tracking
        self.stationary_persons = {}  # bbox_key -> frame_count
        self.horizontal_person_count = {}  # bbox_key -> consecutive_frames
        
        logger.info(f"IncidentDetector initialized for {camera_id}")
    
    def analyze_frame(self, detections: list, frame: np.ndarray, frame_number: int) -> list:
        """
        Analyze current frame for incidents
        
        Args:
            detections: List of YOLO detections from current frame
            frame: Current frame (numpy array)
            frame_number: Frame index
            
        Returns:
            List of incident dictionaries
        """
        incidents = []
        current_time = time.time()
        
        # Store current detections in history
        self.person_history.append(detections)
        
        # Get frame dimensions
        frame_height, frame_width = frame.shape[:2]
        
        # Run all detection types
        incidents.extend(self._detect_falls(detections, frame, current_time))
        incidents.extend(self._detect_violence(detections, frame, current_time))
        incidents.extend(self._detect_theft(detections, frame, current_time))
        incidents.extend(self._detect_intrusion(detections, frame, current_time))
        incidents.extend(self._detect_loitering(detections, frame, current_time))
        incidents.extend(self._detect_health_emergency(detections, frame, current_time))
        
        return incidents
    
    def _detect_falls(self, detections: list, frame: np.ndarray, current_time: float) -> list:
        """
        Detect person falling (horizontal orientation)
        Detection criteria: Person bbox aspect ratio < 0.7 (width > height)
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        for person in persons:
            bbox = person['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            
            if width > 0 and height > 0:
                aspect_ratio = height / width
                
                # Fall detected: width > height (lying down)
                if aspect_ratio < 0.7:
                    if self._check_cooldown('fall', current_time):
                        incidents.append({
                            'type': 'fall_detected',
                            'severity': 'high',
                            'confidence': person['conf'],
                            'description': 'Person detected in horizontal position (potential fall)',
                            'camera_id': self.camera_id,
                            'bbox': bbox,
                            'timestamp': current_time,
                            'aspect_ratio': aspect_ratio
                        })
                        self.last_alert_time['fall'] = current_time
                        logger.warning(f"🚨 FALL DETECTED on {self.camera_id}")
        
        return incidents
    
    def _detect_violence(self, detections: list, frame: np.ndarray, current_time: float) -> list:
        """
        Detect potential violence (multiple people in close proximity)
        Detection criteria: 2+ people within 50 pixels
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        if len(persons) >= 2:
            # Check proximity between all pairs
            for i, p1 in enumerate(persons):
                for p2 in persons[i+1:]:
                    distance = self._calculate_distance(p1['bbox'], p2['bbox'])
                    
                    # Very close proximity
                    if distance < 50:
                        if self._check_cooldown('violence', current_time):
                            incidents.append({
                                'type': 'potential_violence',
                                'severity': 'high',
                                'confidence': min(p1['conf'], p2['conf']),
                                'description': f'{len(persons)} people in close proximity (distance: {distance:.1f}px)',
                                'camera_id': self.camera_id,
                                'timestamp': current_time,
                                'num_people': len(persons),
                                'distance': distance
                            })
                            self.last_alert_time['violence'] = current_time
                            logger.warning(f"🚨 POTENTIAL VIOLENCE on {self.camera_id}")
                            break
                if 'violence' in self.last_alert_time:
                    break
        
        return incidents
    
    def _detect_theft(self, detections: list, frame: np.ndarray, current_time: float) -> list:
        """
        Detect potential theft (person near valuable object)
        Detection criteria: Person within 100 pixels of valuable item
        """
        incidents = []
        
        valuable_objects = ['backpack', 'handbag', 'suitcase', 'laptop', 'cell phone']
        persons = [d for d in detections if d['class_name'] == 'person']
        valuables = [d for d in detections if d['class_name'] in valuable_objects]
        
        if len(persons) > 0 and len(valuables) > 0:
            for person in persons:
                for valuable in valuables:
                    distance = self._calculate_distance(person['bbox'], valuable['bbox'])
                    
                    # Person near valuable object
                    if distance < 100:
                        if self._check_cooldown('theft', current_time):
                            incidents.append({
                                'type': 'potential_theft',
                                'severity': 'medium',
                                'confidence': 0.6,
                                'description': f'Person within {distance:.0f}px of {valuable["class_name"]}',
                                'camera_id': self.camera_id,
                                'timestamp': current_time,
                                'object': valuable['class_name'],
                                'distance': distance
                            })
                            self.last_alert_time['theft'] = current_time
                            logger.warning(f"🚨 POTENTIAL THEFT on {self.camera_id}")
                            break
        
        return incidents
    
    def _detect_intrusion(self, detections: list, frame: np.ndarray, current_time: float) -> list:
        """
        Detect intrusion in restricted zones
        Detection criteria: Person center in defined restricted area
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        frame_height, frame_width = frame.shape[:2]
        
        # Define restricted zone (example: bottom-right quadrant)
        # Customize this based on your camera setup
        restricted_zone = {
            'x_min': frame_width * 0.7,
            'x_max': frame_width,
            'y_min': frame_height * 0.7,
            'y_max': frame_height
        }
        
        for person in persons:
            bbox = person['bbox']
            person_center_x = (bbox[0] + bbox[2]) / 2
            person_center_y = (bbox[1] + bbox[3]) / 2
            
            # Check if person center is in restricted zone
            in_zone = (
                restricted_zone['x_min'] < person_center_x < restricted_zone['x_max'] and
                restricted_zone['y_min'] < person_center_y < restricted_zone['y_max']
            )
            
            if in_zone:
                if self._check_cooldown('intrusion', current_time):
                    incidents.append({
                        'type': 'intrusion',
                        'severity': 'high',
                        'confidence': person['conf'],
                        'description': 'Person detected in restricted area',
                        'camera_id': self.camera_id,
                        'timestamp': current_time,
                        'position': (person_center_x, person_center_y)
                    })
                    self.last_alert_time['intrusion'] = current_time
                    logger.warning(f"🚨 INTRUSION on {self.camera_id}")
        
        return incidents
    
    def _detect_loitering(self, detections: list, frame: np.ndarray, current_time: float) -> list:
        """
        Detect loitering (person stationary for extended time)
        Detection criteria: Same position for 30+ frames (~30 seconds)
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        # Clean up old stationary trackers
        current_keys = set()
        
        for person in persons:
            bbox = person['bbox']
            # Create simple position key (rounded to 10px grid)
            bbox_key = f"{int(bbox[0]/10)*10}_{int(bbox[1]/10)*10}"
            current_keys.add(bbox_key)
            
            # Update counter
            if bbox_key not in self.stationary_persons:
                self.stationary_persons[bbox_key] = 1
            else:
                self.stationary_persons[bbox_key] += 1
            
            # Check if stationary for long time (30 frames = ~30 seconds at 1 FPS)
            if self.stationary_persons[bbox_key] > 30:
                if self._check_cooldown('loitering', current_time):
                    incidents.append({
                        'type': 'loitering',
                        'severity': 'low',
                        'confidence': 0.7,
                        'description': f'Person loitering for {self.stationary_persons[bbox_key]} frames',
                        'camera_id': self.camera_id,
                        'timestamp': current_time,
                        'duration_frames': self.stationary_persons[bbox_key]
                    })
                    self.last_alert_time['loitering'] = current_time
                    logger.info(f"⚠️ LOITERING detected on {self.camera_id}")
        
        # Remove trackers for persons no longer in frame
        keys_to_remove = [k for k in self.stationary_persons.keys() if k not in current_keys]
        for key in keys_to_remove:
            del self.stationary_persons[key]
        
        return incidents
    
    def _detect_health_emergency(self, detections: list, frame: np.ndarray, current_time: float) -> list:
        """
        Detect health emergency (person on ground for extended time)
        Detection criteria: Horizontal person near ground for 10+ frames
        """
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        frame_height, frame_width = frame.shape[:2]
        current_horizontal_keys = set()
        
        for person in persons:
            bbox = person['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            
            if width > 0 and height > 0:
                aspect_ratio = height / width
                
                # Person horizontal AND in lower part of frame (on ground)
                is_horizontal = aspect_ratio < 0.7
                is_on_ground = bbox[3] > frame_height * 0.7
                
                if is_horizontal and is_on_ground:
                    # Track this horizontal person
                    bbox_key = f"{int(bbox[0]/10)*10}_{int(bbox[1]/10)*10}"
                    current_horizontal_keys.add(bbox_key)
                    
                    if bbox_key not in self.horizontal_person_count:
                        self.horizontal_person_count[bbox_key] = 1
                    else:
                        self.horizontal_person_count[bbox_key] += 1
                    
                    # If horizontal for 10+ consecutive frames
                    if self.horizontal_person_count[bbox_key] >= 10:
                        if self._check_cooldown('health_emergency', current_time):
                            incidents.append({
                                'type': 'health_emergency',
                                'severity': 'critical',
                                'confidence': 0.8,
                                'description': f'Person motionless on ground for {self.horizontal_person_count[bbox_key]} frames - possible medical emergency',
                                'camera_id': self.camera_id,
                                'timestamp': current_time,
                                'duration_frames': self.horizontal_person_count[bbox_key],
                                'bbox': bbox
                            })
                            self.last_alert_time['health_emergency'] = current_time
                            logger.error(f"🚨🚨 HEALTH EMERGENCY on {self.camera_id}")
        
        # Clean up trackers
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
    
    def reset(self):
        """Reset all trackers (useful when changing camera or restarting)"""
        self.person_history.clear()
        self.motion_history.clear()
        self.last_alert_time.clear()
        self.stationary_persons.clear()
        self.horizontal_person_count.clear()
        logger.info(f"IncidentDetector reset for {self.camera_id}")


# Quick test
if __name__ == '__main__':
    import cv2
    
    print("=== Testing IncidentDetector ===")
    
    detector = IncidentDetector('test_camera')
    
    # Create test frame
    test_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Mock detections
    mock_detections = [
        {'bbox': [100, 300, 200, 350], 'conf': 0.9, 'class_name': 'person'},  # Horizontal person (fall)
    ]
    
    incidents = detector.analyze_frame(mock_detections, test_frame, 1)
    
    print(f"\n✅ Detected {len(incidents)} incidents")
    for inc in incidents:
        print(f"  - {inc['type']}: {inc['description']}")