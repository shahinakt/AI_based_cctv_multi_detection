
import mediapipe as mp
import cv2
import numpy as np
from typing import List, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PoseEstimator:
    """
    Human pose estimation using MediaPipe (primary) with fallback
    """
    
    def __init__(self, use_mediapipe: bool = True, min_detection_confidence: float = 0.5):
        """
        Initialize pose estimator
        
        Args:
            use_mediapipe: Use MediaPipe (True) or fallback method (False)
            min_detection_confidence: Minimum confidence for detection
        """
        self.use_mediapipe = use_mediapipe
        
        if use_mediapipe:
            try:
                # Initialize MediaPipe Pose
                self.mp_pose = mp.solutions.pose
                self.pose = self.mp_pose.Pose(
                    static_image_mode=False,
                    model_complexity=1,  # 0=lite, 1=full, 2=heavy
                    min_detection_confidence=min_detection_confidence,
                    min_tracking_confidence=0.5
                )
                self.mp_draw = mp.solutions.drawing_utils
                logger.info("✅ MediaPipe Pose initialized")
                
            except Exception as e:
                logger.error(f"Failed to initialize MediaPipe: {e}")
                logger.warning("Falling back to simple detection")
                self.use_mediapipe = False
                self.pose = None
        else:
            self.pose = None
            logger.info("Using fallback pose detection")
    
    def estimate(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Estimate poses in frame
        
        Args:
            frame: Input frame (BGR format)
            
        Returns:
            List of poses: [{'keypoints': [(x, y, confidence), ...], 'conf': float}]
        """
        if self.use_mediapipe and self.pose is not None:
            return self._estimate_mediapipe(frame)
        else:
            return self._estimate_fallback(frame)
    
    def _estimate_mediapipe(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Estimate pose using MediaPipe"""
        try:
            # Convert BGR to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Process frame
            results = self.pose.process(rgb_frame)
            
            poses = []
            
            if results.pose_landmarks:
                keypoints = []
                confidences = []
                
                # Extract all 33 landmarks
                for lm in results.pose_landmarks.landmark:
                    x = lm.x * frame.shape[1]  # Convert normalized to pixel coords
                    y = lm.y * frame.shape[0]
                    confidence = lm.visibility
                    
                    keypoints.append((x, y, confidence))
                    confidences.append(confidence)
                
                # Calculate overall pose confidence (average of all keypoint confidences)
                avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
                
                poses.append({
                    'keypoints': keypoints,
                    'conf': avg_confidence,
                    'num_keypoints': len(keypoints)
                })
            
            return poses
            
        except Exception as e:
            logger.error(f"MediaPipe estimation error: {e}")
            return []
    
    def _estimate_fallback(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Simple fallback pose detection (center of frame)
        Used when MediaPipe is not available
        """
        # Return a mock pose at center of frame
        center_x = frame.shape[1] / 2
        center_y = frame.shape[0] / 2
        
        return [{
            'keypoints': [(center_x, center_y, 0.5)],
            'conf': 0.5,
            'num_keypoints': 1
        }]
    
    def draw_pose(self, frame: np.ndarray, poses: List[Dict[str, Any]]) -> np.ndarray:
        """
        Draw pose keypoints on frame
        
        Args:
            frame: Input frame
            poses: List of pose dictionaries from estimate()
            
        Returns:
            Frame with poses drawn
        """
        output = frame.copy()
        
        for pose in poses:
            keypoints = pose['keypoints']
            
            # Draw keypoints
            for (x, y, conf) in keypoints:
                if conf > 0.5:  # Only draw confident keypoints
                    cv2.circle(output, (int(x), int(y)), 3, (0, 255, 0), -1)
            
            # Draw skeleton connections (simplified)
            # MediaPipe has 33 keypoints, connect major body parts
            if len(keypoints) >= 33:
                connections = [
                    (11, 12),  # Shoulders
                    (11, 13), (13, 15),  # Left arm
                    (12, 14), (14, 16),  # Right arm
                    (11, 23), (12, 24),  # Torso
                    (23, 24),  # Hips
                    (23, 25), (25, 27),  # Left leg
                    (24, 26), (26, 28),  # Right leg
                ]
                
                for (start_idx, end_idx) in connections:
                    if start_idx < len(keypoints) and end_idx < len(keypoints):
                        start = keypoints[start_idx]
                        end = keypoints[end_idx]
                        
                        if start[2] > 0.5 and end[2] > 0.5:  # Both keypoints confident
                            cv2.line(output, 
                                   (int(start[0]), int(start[1])),
                                   (int(end[0]), int(end[1])),
                                   (0, 255, 0), 2)
        
        return output
    
    def get_pose_features(self, pose: Dict[str, Any]) -> Dict[str, float]:
        """
        Extract useful features from pose for incident detection
        
        Returns:
            Dictionary with features like aspect_ratio, center_y, etc.
        """
        if not pose or not pose.get('keypoints'):
            return {}
        
        keypoints = pose['keypoints']
        
        # Get bounding box of pose
        xs = [kp[0] for kp in keypoints if kp[2] > 0.5]
        ys = [kp[1] for kp in keypoints if kp[2] > 0.5]
        
        if not xs or not ys:
            return {}
        
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        
        width = max_x - min_x
        height = max_y - min_y
        
        features = {
            'bbox': [min_x, min_y, max_x, max_y],
            'width': width,
            'height': height,
            'aspect_ratio': height / width if width > 0 else 0,
            'center_x': (min_x + max_x) / 2,
            'center_y': (min_y + max_y) / 2,
            'confidence': pose['conf']
        }
        
        return features
    
    def __del__(self):
        """Cleanup"""
        if hasattr(self, 'pose') and self.pose is not None:
            self.pose.close()


# Quick test
if __name__ == '__main__':
    import time
    
    print("=== Testing PoseEstimator ===")
    
    estimator = PoseEstimator(use_mediapipe=True)
    
    # Create test frame
    test_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    
    start = time.time()
    poses = estimator.estimate(test_frame)
    elapsed = time.time() - start
    
    print(f"\n✅ Pose estimation: {elapsed*1000:.1f}ms")
    print(f"Detected poses: {len(poses)}")
    
    if poses:
        features = estimator.get_pose_features(poses[0])
        print(f"Pose features: {features}")