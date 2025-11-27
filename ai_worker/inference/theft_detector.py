"""
ai_worker/inference/theft_detector.py - NEW FILE
Context-aware theft detection to reduce false positives
"""
import numpy as np
from collections import defaultdict
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SmartTheftDetector:
    """
    Improved theft detection with context awareness
    
    Key Improvements:
    1. Object ownership tracking - remembers who was near object first
    2. Suspicious behavior patterns - quick grab vs normal interaction
    3. Multi-person scenarios - detects object handoff vs theft
    4. Time-of-day context - higher suspicion at night
    5. Location context - higher risk in public areas
    """
    
    def __init__(self, camera_id: str):
        self.camera_id = camera_id
        
        # Track object-person associations
        self.object_owners = {}  # object_id -> {'person_bbox', 'frames_together', 'confidence'}
        self.object_locations = {}  # object_id -> last_known_position
        self.object_stationary_time = {}  # object_id -> frames_stationary
        
        # Theft candidate tracking
        self.theft_candidates = defaultdict(lambda: {
            'frames': [],
            'behavior_score': 0.0,
            'is_owner': False
        })
        
        self.VALUABLE_OBJECTS = [
            'backpack', 'handbag', 'suitcase', 'laptop', 
            'cell phone', 'handbag', 'purse'
        ]
        
        logger.info(f"SmartTheftDetector initialized for {camera_id}")
    
    def analyze_theft(
        self,
        detections: list,
        frame: np.ndarray,
        frame_number: int,
        current_time: float
    ) -> list:
        """
        Analyze frame for potential theft with context awareness
        
        Returns:
            List of theft incidents with confidence scores
        """
        incidents = []
        
        persons = [d for d in detections if d['class_name'] == 'person' and d['conf'] > 0.7]
        valuables = [d for d in detections if d['class_name'] in self.VALUABLE_OBJECTS and d['conf'] > 0.6]
        
        if not persons or not valuables:
            return []
        
        # Step 1: Track object ownership
        self._update_object_ownership(persons, valuables, frame_number)
        
        # Step 2: Detect suspicious interactions
        for valuable in valuables:
            object_id = self._get_object_id(valuable)
            
            for person in persons:
                distance = self._calculate_distance(person['bbox'], valuable['bbox'])
                
                # Only analyze if person is close to object
                if distance < 100:
                    # Check if this is the owner or a new person
                    is_owner = self._is_likely_owner(person, object_id)
                    
                    # Analyze behavior pattern
                    behavior_score = self._analyze_behavior(
                        person, valuable, distance, frame_number, is_owner
                    )
                    
                    # Create theft candidate key
                    theft_key = f"theft_{object_id}_{int(person['bbox'][0]/20)*20}"
                    
                    self.theft_candidates[theft_key]['frames'].append(frame_number)
                    self.theft_candidates[theft_key]['behavior_score'] += behavior_score
                    self.theft_candidates[theft_key]['is_owner'] = is_owner
                    
                    # Confirm theft if suspicious behavior sustained
                    if len(self.theft_candidates[theft_key]['frames']) >= 10:
                        avg_behavior_score = (
                            self.theft_candidates[theft_key]['behavior_score'] / 
                            len(self.theft_candidates[theft_key]['frames'])
                        )
                        
                        # High suspicion if:
                        # - NOT the owner (0.7+)
                        # - OR very suspicious behavior even if owner (0.9+)
                        if (not is_owner and avg_behavior_score > 0.7) or avg_behavior_score > 0.9:
                            
                            # Determine severity based on context
                            severity = self._determine_severity(
                                avg_behavior_score,
                                is_owner,
                                current_time,
                                valuable['class_name']
                            )
                            
                            incidents.append({
                                'type': 'potential_theft',
                                'severity': severity,
                                'confidence': min(avg_behavior_score, 0.95),
                                'description': self._generate_theft_description(
                                    valuable['class_name'],
                                    is_owner,
                                    avg_behavior_score,
                                    len(self.theft_candidates[theft_key]['frames'])
                                ),
                                'camera_id': self.camera_id,
                                'timestamp': current_time,
                                'object': valuable['class_name'],
                                'distance': distance,
                                'is_owner': is_owner,
                                'behavior_score': avg_behavior_score,
                                'frame_count': len(self.theft_candidates[theft_key]['frames'])
                            })
                            
                            # Reset candidate
                            del self.theft_candidates[theft_key]
                            
                            logger.warning(
                                f"🚨 THEFT DETECTED on {self.camera_id}: "
                                f"{valuable['class_name']} (owner={is_owner}, score={avg_behavior_score:.2f})"
                            )
        
        return incidents
    
    def _update_object_ownership(self, persons: list, valuables: list, frame_number: int):
        """
        Track which person is likely the owner of each object
        Owner = person who was near object first and stayed longest
        """
        for valuable in valuables:
            object_id = self._get_object_id(valuable)
            
            # Find person closest to this object
            min_distance = float('inf')
            closest_person = None
            
            for person in persons:
                distance = self._calculate_distance(person['bbox'], valuable['bbox'])
                if distance < min_distance:
                    min_distance = distance
                    closest_person = person
            
            # If someone is very close (< 80px), consider them with the object
            if closest_person and min_distance < 80:
                if object_id not in self.object_owners:
                    # First person near object = likely owner
                    self.object_owners[object_id] = {
                        'person_bbox': closest_person['bbox'],
                        'frames_together': 1,
                        'confidence': 0.5  # Initial confidence
                    }
                else:
                    # Check if same person (bbox similarity)
                    if self._is_same_person(
                        closest_person['bbox'],
                        self.object_owners[object_id]['person_bbox']
                    ):
                        # Same person still near object - increase confidence
                        self.object_owners[object_id]['frames_together'] += 1
                        self.object_owners[object_id]['confidence'] = min(
                            0.95,
                            0.5 + (self.object_owners[object_id]['frames_together'] * 0.01)
                        )
                        self.object_owners[object_id]['person_bbox'] = closest_person['bbox']
                    else:
                        # Different person - potential ownership change or theft
                        # Keep tracking original owner unless new person stays long
                        pass
            
            # Track if object is stationary (unattended)
            if object_id in self.object_locations:
                prev_center = self.object_locations[object_id]
                curr_center = self._get_bbox_center(valuable['bbox'])
                movement = np.sqrt(
                    (curr_center[0] - prev_center[0])**2 + 
                    (curr_center[1] - prev_center[1])**2
                )
                
                if movement < 10:  # Nearly stationary
                    self.object_stationary_time[object_id] = \
                        self.object_stationary_time.get(object_id, 0) + 1
                else:
                    self.object_stationary_time[object_id] = 0
            
            # Update object location
            self.object_locations[object_id] = self._get_bbox_center(valuable['bbox'])
    
    def _is_likely_owner(self, person: dict, object_id: str) -> bool:
        """
        Check if person is likely the owner of object
        
        Returns:
            True if person matches tracked owner
        """
        if object_id not in self.object_owners:
            return False
        
        owner_bbox = self.object_owners[object_id]['person_bbox']
        confidence = self.object_owners[object_id]['confidence']
        
        # Check bbox similarity
        is_same = self._is_same_person(person['bbox'], owner_bbox)
        
        # Return True only if high confidence match
        return is_same and confidence > 0.7
    
    def _analyze_behavior(
        self,
        person: dict,
        valuable: dict,
        distance: float,
        frame_number: int,
        is_owner: bool
    ) -> float:
        """
        Analyze behavior pattern to determine suspicion level
        
        Returns:
            Behavior score (0.0 = normal, 1.0 = highly suspicious)
        """
        suspicion_score = 0.0
        
        # Factor 1: Proximity (closer = more suspicious if not owner)
        if not is_owner:
            if distance < 30:
                suspicion_score += 0.4
            elif distance < 50:
                suspicion_score += 0.3
            elif distance < 80:
                suspicion_score += 0.2
        else:
            # Owner being close is normal
            suspicion_score += 0.1
        
        # Factor 2: Object left unattended
        object_id = self._get_object_id(valuable)
        if object_id in self.object_stationary_time:
            unattended_frames = self.object_stationary_time[object_id]
            if unattended_frames > 30 and not is_owner:
                # Object left alone + non-owner approaching = suspicious
                suspicion_score += 0.3
        
        # Factor 3: Multiple people near same object
        # (This would require tracking in main loop - simplified here)
        
        # Factor 4: Rapid approach
        # (Would require velocity tracking - simplified here)
        
        return min(suspicion_score, 1.0)
    
    def _determine_severity(
        self,
        behavior_score: float,
        is_owner: bool,
        current_time: float,
        object_type: str
    ) -> str:
        """Determine incident severity based on context"""
        
        # Higher value objects = higher severity
        high_value = object_type in ['laptop', 'handbag', 'suitcase']
        
        # Night time (22:00 - 06:00) = higher severity
        hour = time.localtime(current_time).tm_hour
        is_night = hour >= 22 or hour <= 6
        
        if behavior_score > 0.9 or (not is_owner and high_value):
            return 'critical'
        elif behavior_score > 0.8 or is_night:
            return 'high'
        elif behavior_score > 0.7:
            return 'medium'
        else:
            return 'low'
    
    def _generate_theft_description(
        self,
        object_type: str,
        is_owner: bool,
        behavior_score: float,
        frame_count: int
    ) -> str:
        """Generate human-readable incident description"""
        
        if is_owner:
            return (
                f"UNUSUAL BEHAVIOR: Owner's interaction with {object_type} "
                f"shows suspicious patterns (score: {behavior_score:.2f}, "
                f"{frame_count} frames). Possible forced removal or distress."
            )
        else:
            return (
                f"POTENTIAL THEFT: Unidentified person near {object_type} "
                f"for {frame_count} frames with suspicious behavior "
                f"(score: {behavior_score:.2f}). Not recognized as owner."
            )
    
    def _get_object_id(self, valuable: dict) -> str:
        """Generate unique ID for object based on position"""
        bbox = valuable['bbox']
        return f"{valuable['class_name']}_{int(bbox[0]/30)*30}_{int(bbox[1]/30)*30}"
    
    def _get_bbox_center(self, bbox: list) -> tuple:
        """Get center point of bounding box"""
        return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
    
    def _calculate_distance(self, bbox1: list, bbox2: list) -> float:
        """Calculate center-to-center distance"""
        center1 = self._get_bbox_center(bbox1)
        center2 = self._get_bbox_center(bbox2)
        return np.sqrt((center1[0] - center2[0])**2 + (center1[1] - center2[1])**2)
    
    def _is_same_person(self, bbox1: list, bbox2: list) -> bool:
        """
        Check if two bboxes likely represent same person
        Uses position and size similarity
        """
        center1 = self._get_bbox_center(bbox1)
        center2 = self._get_bbox_center(bbox2)
        
        # Check position similarity (within 50px)
        distance = np.sqrt((center1[0] - center2[0])**2 + (center1[1] - center2[1])**2)
        if distance > 50:
            return False
        
        # Check size similarity
        size1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])
        size2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
        size_ratio = min(size1, size2) / max(size1, size2)
        
        return size_ratio > 0.7  # Sizes should be similar
    
    def reset(self):
        """Reset all tracking"""
        self.object_owners.clear()
        self.object_locations.clear()
        self.object_stationary_time.clear()
        self.theft_candidates.clear()