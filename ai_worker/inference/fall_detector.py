"""
ai_worker/inference/fall_detector.py - NEW FILE
Context-aware fall detection to distinguish falls from sleeping/resting
"""
import numpy as np
from collections import deque, defaultdict
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SmartFallDetector:
    """
    Improved fall detection with context awareness
    
    Key Improvements:
    1. Motion history analysis - detect sudden drop vs gradual lying down
    2. Impact detection - sudden position change = likely fall
    3. Pre-fall posture tracking - standing → horizontal vs already sitting
    4. Micro-movement detection - unconscious people don't move, sleepers do
    5. Location context - falls in bathrooms/stairs more serious
    6. Time context - person lying down at night = likely sleeping
    """
    
    def __init__(self, camera_id: str):
        self.camera_id = camera_id
        
        # Track person positions over time (last 60 frames)
        self.person_trajectories = defaultdict(lambda: deque(maxlen=60))
        
        # Track horizontal persons
        self.horizontal_persons = {}  # person_id -> detection info
        
        # Track pre-fall states
        self.standing_persons = defaultdict(lambda: deque(maxlen=30))
        
        self.FALL_CONFIRMATION_FRAMES = 10  # Need 10 frames to confirm
        self.MICRO_MOVEMENT_THRESHOLD = 5  # pixels
        
        logger.info(f"SmartFallDetector initialized for {camera_id}")
    
    def analyze_fall(
        self,
        detections: list,
        frame: np.ndarray,
        frame_number: int,
        current_time: float
    ) -> list:
        """
        Analyze frame for falls with context awareness
        
        Returns:
            List of fall incidents with confidence scores
        """
        incidents = []
        
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > 0.7]
        frame_height, frame_width = frame.shape[:2]
        
        for person in persons:
            person_id = self._get_person_id(person)
            bbox = person['bbox']
            
            # Calculate aspect ratio
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            aspect_ratio = height / width if width > 0 else 0
            
            # Get person center
            center = self._get_bbox_center(bbox)
            
            # Update trajectory
            self.person_trajectories[person_id].append({
                'frame': frame_number,
                'center': center,
                'aspect_ratio': aspect_ratio,
                'bbox': bbox,
                'on_ground': bbox[3] > frame_height * 0.7
            })
            
            # Check if person is horizontal
            is_horizontal = aspect_ratio < 0.6
            on_ground = bbox[3] > frame_height * 0.7
            
            if is_horizontal and on_ground:
                # Person is in horizontal position
                
                if person_id not in self.horizontal_persons:
                    # First detection of horizontal position
                    
                    # Analyze if this was a fall or intentional lying down
                    fall_likelihood = self._analyze_fall_likelihood(
                        person_id,
                        frame_number,
                        current_time,
                        bbox,
                        frame_height,
                        frame_width
                    )
                    
                    self.horizontal_persons[person_id] = {
                        'first_detected_frame': frame_number,
                        'frames_horizontal': 1,
                        'fall_likelihood': fall_likelihood,
                        'last_movement_frame': frame_number,
                        'initial_bbox': bbox,
                        'micro_movements': 0
                    }
                else:
                    # Continue tracking horizontal person
                    self.horizontal_persons[person_id]['frames_horizontal'] += 1
                    
                    # Check for micro-movements (sign of being conscious/sleeping)
                    has_movement = self._detect_micro_movement(
                        self.horizontal_persons[person_id]['initial_bbox'],
                        bbox
                    )
                    
                    if has_movement:
                        self.horizontal_persons[person_id]['micro_movements'] += 1
                        self.horizontal_persons[person_id]['last_movement_frame'] = frame_number
                    
                    # Determine if this is a medical emergency
                    frames_horizontal = self.horizontal_persons[person_id]['frames_horizontal']
                    frames_since_movement = frame_number - self.horizontal_persons[person_id]['last_movement_frame']
                    fall_likelihood = self.horizontal_persons[person_id]['fall_likelihood']
                    
                    # CRITICAL EMERGENCY if:
                    # 1. High fall likelihood (sudden drop)
                    # 2. No movement for 15+ frames
                    # 3. Been horizontal for 10+ frames
                    if (fall_likelihood > 0.8 and 
                        frames_since_movement > 15 and 
                        frames_horizontal >= self.FALL_CONFIRMATION_FRAMES):
                        
                        incidents.append({
                            'type': 'fall_detected',
                            'severity': 'critical',
                            'confidence': min(fall_likelihood, 0.95),
                            'description': self._generate_fall_description(
                                fall_likelihood,
                                frames_horizontal,
                                frames_since_movement,
                                self.horizontal_persons[person_id]['micro_movements']
                            ),
                            'camera_id': self.camera_id,
                            'timestamp': current_time,
                            'bbox': bbox,
                            'fall_likelihood': fall_likelihood,
                            'frames_horizontal': frames_horizontal,
                            'frames_without_movement': frames_since_movement,
                            'micro_movements': self.horizontal_persons[person_id]['micro_movements']
                        })
                        
                        logger.error(
                            f"🚨 FALL DETECTED on {self.camera_id}: "
                            f"likelihood={fall_likelihood:.2f}, "
                            f"motionless={frames_since_movement} frames"
                        )
                        
                        # Keep tracking but mark as alerted
                        self.horizontal_persons[person_id]['alerted'] = True
                    
                    # MEDIUM PRIORITY if:
                    # - Some fall indicators but person is moving (might be injured but conscious)
                    elif (fall_likelihood > 0.6 and 
                          frames_horizontal >= 20 and
                          self.horizontal_persons[person_id].get('alerted') != True):
                        
                        # Check if it's nighttime (sleeping is normal)
                        hour = time.localtime(current_time).tm_hour
                        is_night = 22 <= hour or hour <= 6
                        
                        if not is_night:  # Don't alert for sleeping at night
                            incidents.append({
                                'type': 'fall_detected',
                                'severity': 'medium',
                                'confidence': fall_likelihood * 0.7,  # Lower confidence
                                'description': (
                                    f"Person lying on ground for {frames_horizontal} frames "
                                    f"with some movement. Possible injury requiring attention."
                                ),
                                'camera_id': self.camera_id,
                                'timestamp': current_time,
                                'bbox': bbox,
                                'fall_likelihood': fall_likelihood,
                                'frames_horizontal': frames_horizontal
                            })
            else:
                # Person is vertical/standing - track for pre-fall detection
                if person_id in self.horizontal_persons:
                    # Person got up - no longer horizontal
                    del self.horizontal_persons[person_id]
        
        # Cleanup old horizontal persons (no longer in frame)
        current_person_ids = [self._get_person_id(p) for p in persons]
        for person_id in list(self.horizontal_persons.keys()):
            if person_id not in current_person_ids:
                del self.horizontal_persons[person_id]
        
        return incidents
    
    def _analyze_fall_likelihood(
        self,
        person_id: str,
        frame_number: int,
        current_time: float,
        bbox: list,
        frame_height: int,
        frame_width: int
    ) -> float:
        """
        Analyze likelihood that horizontal position is due to a fall
        
        Returns:
            Fall likelihood score (0.0 = definitely not fall, 1.0 = definitely fall)
        """
        likelihood = 0.0
        
        trajectory = self.person_trajectories[person_id]
        
        if len(trajectory) < 5:
            # Not enough history - assume medium likelihood
            return 0.5
        
        # Factor 1: Vertical velocity (was person standing before?)
        recent_frames = list(trajectory)[-10:]  # Last 10 frames
        
        # Check if person was standing/vertical in recent past
        was_vertical = False
        for hist in recent_frames[:-1]:  # Exclude current frame
            if hist['aspect_ratio'] > 1.2:  # Person was vertical
                was_vertical = True
                break
        
        if was_vertical:
            # Person went from vertical to horizontal = likely fall
            likelihood += 0.5
        else:
            # Person was already sitting/low = less likely fall
            likelihood += 0.2
        
        # Factor 2: Speed of transition (sudden vs gradual)
        if len(recent_frames) >= 5:
            # Calculate vertical movement speed
            y_positions = [h['center'][1] for h in recent_frames]
            max_y_change = max(y_positions) - min(y_positions)
            
            # Rapid vertical movement = likely fall
            if max_y_change > frame_height * 0.3:  # Moved >30% of frame height
                likelihood += 0.3
            elif max_y_change > frame_height * 0.15:
                likelihood += 0.2
        
        # Factor 3: Location context
        # Falls in certain areas more likely to be serious
        person_x = (bbox[0] + bbox[2]) / 2
        person_y = (bbox[1] + bbox[3]) / 2
        
        # Example: Bottom or side of frame (stairs, bathrooms often at edges)
        if person_y > frame_height * 0.8 or person_x < frame_width * 0.2:
            likelihood += 0.1
        
        # Factor 4: Time of day
        hour = time.localtime(current_time).tm_hour
        is_night = 22 <= hour or hour <= 6
        
        if is_night:
            # At night, horizontal position more likely to be sleeping
            likelihood -= 0.3
        
        return max(0.0, min(1.0, likelihood))
    
    def _detect_micro_movement(self, bbox1: list, bbox2: list) -> bool:
        """
        Detect small movements (breathing, shifting)
        Conscious/sleeping people move slightly, unconscious don't
        
        Returns:
            True if micro-movement detected
        """
        center1 = self._get_bbox_center(bbox1)
        center2 = self._get_bbox_center(bbox2)
        
        # Calculate movement
        movement = np.sqrt(
            (center2[0] - center1[0])**2 + 
            (center2[1] - center1[1])**2
        )
        
        # Also check size change (breathing causes bbox size to change slightly)
        size1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])
        size2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
        size_change = abs(size2 - size1) / size1 if size1 > 0 else 0
        
        # Micro-movement = small position change OR size change
        return movement > self.MICRO_MOVEMENT_THRESHOLD or size_change > 0.05
    
    def _generate_fall_description(
        self,
        fall_likelihood: float,
        frames_horizontal: int,
        frames_without_movement: int,
        total_micro_movements: int
    ) -> str:
        """Generate human-readable fall description"""
        
        if fall_likelihood > 0.8 and frames_without_movement > 15:
            return (
                f"CRITICAL: Person fell and has been motionless on ground for "
                f"{frames_without_movement} frames ({frames_without_movement}s). "
                f"NO MOVEMENT detected. IMMEDIATE MEDICAL ATTENTION REQUIRED."
            )
        elif fall_likelihood > 0.7:
            return (
                f"HIGH PRIORITY: Person on ground for {frames_horizontal} frames "
                f"after sudden position change. {total_micro_movements} micro-movements detected. "
                f"Possible injury - check for response."
            )
        else:
            return (
                f"MEDIUM PRIORITY: Person lying on ground for {frames_horizontal} frames. "
                f"{total_micro_movements} movements detected. May be resting but verify."
            )
    
    def _get_person_id(self, person: dict) -> str:
        """Generate unique ID for person based on position"""
        bbox = person['bbox']
        return f"person_{int(bbox[0]/50)*50}_{int(bbox[1]/50)*50}"
    
    def _get_bbox_center(self, bbox: list) -> tuple:
        """Get center point of bounding box"""
        return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
    
    def reset(self):
        """Reset all tracking"""
        self.person_trajectories.clear()
        self.horizontal_persons.clear()
        self.standing_persons.clear()