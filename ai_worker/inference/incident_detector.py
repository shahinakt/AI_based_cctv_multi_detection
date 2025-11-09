# ai_worker/inference/incident_detector.py
import numpy as np
from collections import deque
import time

class IncidentDetector:
    """
    Advanced incident detection with temporal tracking
    """
    
    def __init__(self, camera_id):
        self.camera_id = camera_id
        
        # Tracking history (last 30 frames)
        self.person_history = deque(maxlen=30)
        self.motion_history = deque(maxlen=30)
        
        # Incident cooldown (don't spam alerts)
        self.last_alert_time = {}
        self.alert_cooldown = 5.0  # seconds
        
        # State tracking
        self.stationary_persons = {}  # track_id -> frame_count
        
    def analyze_frame(self, detections, frame, frame_number):
        """
        Analyze current frame for incidents
        
        Returns: List of incident dicts
        """
        incidents = []
        current_time = time.time()
        
        # Store current detections
        self.person_history.append(detections)
        
        # 1. FALL DETECTION (based on bounding box aspect ratio)
        fall_incidents = self._detect_falls(detections, current_time)
        incidents.extend(fall_incidents)
        
        # 2. FIGHT/VIOLENCE DETECTION (multiple people + proximity + motion)
        violence_incidents = self._detect_violence(detections, current_time)
        incidents.extend(violence_incidents)
        
        # 3. THEFT DETECTION (person + valuable object + sudden disappearance)
        theft_incidents = self._detect_theft(detections, current_time)
        incidents.extend(theft_incidents)
        
        # 4. INTRUSION DETECTION (person in restricted zone)
        intrusion_incidents = self._detect_intrusion(detections, frame, current_time)
        incidents.extend(intrusion_incidents)
        
        # 5. LOITERING DETECTION (person stationary for long time)
        loiter_incidents = self._detect_loitering(detections, current_time)
        incidents.extend(loiter_incidents)
        
        # 6. HEALTH EMERGENCY (person on ground for extended time)
        health_incidents = self._detect_health_emergency(detections, current_time)
        incidents.extend(health_incidents)
        
        return incidents
    
    def _detect_falls(self, detections, current_time):
        """Detect person falling (horizontal orientation)"""
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        for person in persons:
            bbox = person['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            
            if width > 0:
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
                            'timestamp': current_time
                        })
                        self.last_alert_time['fall'] = current_time
        
        return incidents
    
    def _detect_violence(self, detections, current_time):
        """Detect potential violence (multiple people in close proximity)"""
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        if len(persons) >= 2:
            # Check proximity between people
            for i, p1 in enumerate(persons):
                for p2 in persons[i+1:]:
                    distance = self._calculate_distance(p1['bbox'], p2['bbox'])
                    
                    # If people are very close (< 50 pixels)
                    if distance < 50:
                        if self._check_cooldown('violence', current_time):
                            incidents.append({
                                'type': 'potential_violence',
                                'severity': 'high',
                                'confidence': min(p1['conf'], p2['conf']),
                                'description': f'{len(persons)} people in close proximity',
                                'camera_id': self.camera_id,
                                'timestamp': current_time
                            })
                            self.last_alert_time['violence'] = current_time
                            break
        
        return incidents
    
    def _detect_theft(self, detections, current_time):
        """Detect potential theft (person + valuable object)"""
        incidents = []
        
        valuable_objects = ['backpack', 'handbag', 'suitcase', 'laptop', 'cell phone']
        persons = [d for d in detections if d['class_name'] == 'person']
        valuables = [d for d in detections if d['class_name'] in valuable_objects]
        
        if len(persons) > 0 and len(valuables) > 0:
            # Check if person is near valuable
            for person in persons:
                for valuable in valuables:
                    distance = self._calculate_distance(person['bbox'], valuable['bbox'])
                    
                    if distance < 100:  # Within 100 pixels
                        if self._check_cooldown('theft', current_time):
                            incidents.append({
                                'type': 'potential_theft',
                                'severity': 'medium',
                                'confidence': 0.6,
                                'description': f'Person near {valuable["class_name"]}',
                                'camera_id': self.camera_id,
                                'timestamp': current_time
                            })
                            self.last_alert_time['theft'] = current_time
        
        return incidents
    
    def _detect_intrusion(self, detections, frame, current_time):
        """Detect intrusion in restricted zones"""
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        # Define restricted zone (example: bottom-right quadrant)
        frame_height, frame_width = frame.shape[:2]
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
            
            # Check if person is in restricted zone
            if (restricted_zone['x_min'] < person_center_x < restricted_zone['x_max'] and
                restricted_zone['y_min'] < person_center_y < restricted_zone['y_max']):
                
                if self._check_cooldown('intrusion', current_time):
                    incidents.append({
                        'type': 'intrusion',
                        'severity': 'high',
                        'confidence': person['conf'],
                        'description': 'Person detected in restricted area',
                        'camera_id': self.camera_id,
                        'timestamp': current_time
                    })
                    self.last_alert_time['intrusion'] = current_time
        
        return incidents
    
    def _detect_loitering(self, detections, current_time):
        """Detect loitering (person stationary for > 30 seconds)"""
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        # Track stationary persons (simplified - in production use tracking IDs)
        for person in persons:
            bbox = person['bbox']
            bbox_key = f"{int(bbox[0])}_{int(bbox[1])}"  # Simple position key
            
            if bbox_key not in self.stationary_persons:
                self.stationary_persons[bbox_key] = 1
            else:
                self.stationary_persons[bbox_key] += 1
            
            # If stationary for > 30 frames (~30 seconds at 1 FPS)
            if self.stationary_persons[bbox_key] > 30:
                if self._check_cooldown('loitering', current_time):
                    incidents.append({
                        'type': 'loitering',
                        'severity': 'low',
                        'confidence': 0.7,
                        'description': 'Person loitering for extended period',
                        'camera_id': self.camera_id,
                        'timestamp': current_time
                    })
                    self.last_alert_time['loitering'] = current_time
        
        return incidents
    
    def _detect_health_emergency(self, detections, current_time):
        """Detect health emergency (person on ground for extended time)"""
        incidents = []
        persons = [d for d in detections if d['class_name'] == 'person']
        
        for person in persons:
            bbox = person['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            
            if width > 0:
                aspect_ratio = height / width
                
                # Person horizontal and in lower part of frame (on ground)
                if aspect_ratio < 0.7 and bbox[3] > frame_height * 0.7:
                    # Check if this persists over multiple frames
                    if len(self.person_history) > 10:
                        # Count horizontal detections in last 10 frames
                        horizontal_count = sum(
                            1 for frame_dets in list(self.person_history)[-10:]
                            for p in frame_dets if p.get('class_name') == 'person'
                            and (p['bbox'][2] - p['bbox'][0]) / max((p['bbox'][3] - p['bbox'][1]), 1) > 1.3
                        )
                        
                        if horizontal_count > 5:  # 5+ frames
                            if self._check_cooldown('health_emergency', current_time):
                                incidents.append({
                                    'type': 'health_emergency',
                                    'severity': 'critical',
                                    'confidence': 0.8,
                                    'description': 'Person motionless on ground - possible medical emergency',
                                    'camera_id': self.camera_id,
                                    'timestamp': current_time
                                })
                                self.last_alert_time['health_emergency'] = current_time
        
        return incidents
    
    def _calculate_distance(self, bbox1, bbox2):
        """Calculate center-to-center distance between two bounding boxes"""
        center1_x = (bbox1[0] + bbox1[2]) / 2
        center1_y = (bbox1[1] + bbox1[3]) / 2
        center2_x = (bbox2[0] + bbox2[2]) / 2
        center2_y = (bbox2[1] + bbox2[3]) / 2
        
        return np.sqrt((center1_x - center2_x)**2 + (center1_y - center2_y)**2)
    
    def _check_cooldown(self, incident_type, current_time):
        """Check if enough time has passed since last alert of this type"""
        if incident_type not in self.last_alert_time:
            return True
        
        time_since_last = current_time - self.last_alert_time[incident_type]
        return time_since_last > self.alert_cooldown