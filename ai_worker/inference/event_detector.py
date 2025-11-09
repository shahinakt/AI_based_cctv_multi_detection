
from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.models.pose_estimator import PoseEstimator
from ai_worker.models.tracker import ByteTracker
from ai_worker.models.behavior_classifier import BehaviorClassifierWrapper
from typing import List, Dict, Any
import time

class EventDetector:
    def __init__(self):
        self.detector = YOLODetector()
        self.pose_estimator = PoseEstimator()
        self.tracker = ByteTracker()
        self.behavior_classifier = BehaviorClassifierWrapper()
        self.event_history = {}  # track_id: {last_event_time, count}
        self.cooldown = 5.0  # seconds

    def detect_events(self, frame) -> List[Dict[str, Any]]:
        detections = self.detector.predict(frame)
        tracked_objects = self.tracker.update(detections)
        poses = self.pose_estimator.estimate(frame)
        
        events = []
        current_time = time.time()
        
        # Check for falls using pose
        for pose in poses:
            if len(pose['keypoints']) >= 17:  # Full body pose
                # Simple fall heuristic: rapid downward movement of torso keypoints
                torso_y = pose['keypoints'][11][1]  # Right hip y-position
                if torso_y > frame.shape[0] * 0.8:  # Near bottom of frame
                    events.append({
                        'type': 'fall',
                        'confidence': pose['conf'],
                        'location': (int(frame.shape[1]/2), int(frame.shape[0]/2)),
                        'timestamp': current_time
                    })
        
        # Check for fights using proximity and behavior
        if len(tracked_objects) >= 2:
            # Check if two people are close
            for i, obj1 in enumerate(tracked_objects):
                for obj2 in tracked_objects[i+1:]:
                    if obj1['class'] == 'person' and obj2['class'] == 'person':
                        x1, y1, w1, h1 = obj1['bbox']
                        x2, y2, w2, h2 = obj2['bbox']
                        distance = ((x1 - x2)**2 + (y1 - y2)**2)**0.5
                        if distance < 100:  # Close proximity
                            # Use behavior classifier on cropped regions
                            crop1 = frame[y1:y1+h1, x1:x1+w1]
                            crop2 = frame[y2:y2+h2, x2:x2+w2]
                            # Mock behavior check
                            behavior1 = self.behavior_classifier.classify([])
                            behavior2 = self.behavior_classifier.classify([])
                            if behavior1['fight'] > 0.7 or behavior2['fight'] > 0.7:
                                events.append({
                                    'type': 'fight',
                                    'confidence': max(behavior1['fight'], behavior2['fight']),
                                    'location': (int((x1+x2)/2), int((y1+y2)/2)),
                                    'timestamp': current_time
                                })
        
        # Apply cooldown and persistence filters
        filtered_events = []
        for event in events:
            key = f"{event['type']}_{event['location'][0]}_{event['location'][1]}"
            if key not in self.event_history:
                self.event_history[key] = {'last_time': current_time, 'count': 1}
            else:
                if current_time - self.event_history[key]['last_time'] > self.cooldown:
                    self.event_history[key]['count'] += 1
                    self.event_history[key]['last_time'] = current_time
                else:
                    continue
            
            # N-frame persistence: require at least 3 detections
            if self.event_history[key]['count'] >= 3:
                filtered_events.append(event)
        
        return filtered_events