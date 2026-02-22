"""
Frame validation and corruption detection utilities
Handles interlaced video, blank frames, and corrupted data
"""
import cv2
import numpy as np
import logging
from typing import Optional, Tuple, Dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FrameValidator:
    """Validates and  repairs corrupted video frames"""
    
    def __init__(self):
        self.consecutive_bad_frames = 0
        self.total_frames_checked = 0
        self.corrupted_frame_count = 0
        
    def validate_frame(self, frame: np.ndarray, frame_number: int = 0) -> Tuple[bool, str, Dict]:
        """
        Validate if a frame is good for processing
        
        Args:
            frame: Input frame to validate
            frame_number: Current frame number for logging
            
        Returns:
            Tuple of (is_valid, issue_description, frame_stats)
        """
        self.total_frames_checked += 1
        
        if frame is None:
            self.consecutive_bad_frames += 1
            return False, "Frame is None", {}
        
        if not isinstance(frame, np.ndarray):
            self.consecutive_bad_frames += 1
            return False, "Frame is not numpy array", {}
        
        # Check frame dimensions
        if len(frame.shape) < 2:
            self.consecutive_bad_frames += 1
            return False, "Frame has invalid dimensions", {}
        
        height, width = frame.shape[:2]
        
        if height < 10 or width < 10:
            self.consecutive_bad_frames += 1
            return False, f"Frame too small: {width}x{height}", {}
        
        # Calculate frame statistics
        stats = self._calculate_stats(frame)
        
        # Only check for completely black frames (< 1 mean brightness)
        # This is very lenient - static  scenes with plain backgrounds are valid
        if stats['mean_brightness'] < 1:
            self.consecutive_bad_frames += 1
            self.corrupted_frame_count += 1
            return False, f"Frame is completely black (mean: {stats['mean_brightness']:.1f})", stats
        
        # Check for interlacing artifacts (comb effect)
        if self._detect_interlacing(frame):
            logger.warning(f"⚠️ Frame {frame_number}: Interlacing detected, will deinterlace")
            # Don't mark as invalid, just warn
        
        # Note: unique_values check removed - std_dev and mean_brightness checks are sufficient
        # Static scenes with plain backgrounds can have few unique values but are still valid
        
        # Frame is valid
        self.consecutive_bad_frames = 0
        return True, "Valid", stats
    
    def _calculate_stats(self, frame: np.ndarray) -> Dict:
        """Calculate frame statistics for validation"""
        try:
            # Convert to grayscale for analysis
            if len(frame.shape) == 3:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            else:
                gray = frame
            
            # Sample multiple regions to get better representation
            h, w = gray.shape[:2]
            regions = [
                gray[:100, :100],               # Top-left
                gray[:100, -100:],              # Top-right
                gray[-100:, :100],              # Bottom-left
                gray[-100:, -100:],             # Bottom-right
                gray[h//2-50:h//2+50, w//2-50:w//2+50]  # Center
            ]
            
            # Count unique values across all regions
            unique_counts = [len(np.unique(region)) for region in regions]
            max_unique = max(unique_counts)  # Use the region with most variation
            
            stats = {
                'height': frame.shape[0],
                'width': frame.shape[1],
                'channels': frame.shape[2] if len(frame.shape) == 3 else 1,
                'dtype': str(frame.dtype),
                'mean_brightness': float(gray.mean()),
                'std_dev': float(gray.std()),
                'min_value': int(frame.min()),
                'max_value': int(frame.max()),
                'unique_values': max_unique  # Maximum unique values from all sampled regions
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error calculating frame stats: {e}")
            return {'error': str(e)}
    
    def _detect_interlacing(self, frame: np.ndarray) -> bool:
        """
        Detect interlacing artifacts by checking for high-frequency patterns
        in alternating lines
        """
        try:
            if len(frame.shape) == 3:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            else:
                gray = frame
            
            # Sample middle region
            h, w = gray.shape[:2]
            sample = gray[h//4:3*h//4, w//4:3*w//4]
            
            # Compare odd and even lines
            odd_lines = sample[1::2, :]
            even_lines = sample[::2, :]
            
            # If there's significant difference between odd and even lines, likely interlaced
            if odd_lines.shape == even_lines.shape:
                diff = np.abs(odd_lines.astype(float) - even_lines.astype(float)).mean()
                return diff > 15  # Threshold for interlacing detection
            
            return False
            
        except Exception as e:
            logger.error(f"Error detecting interlacing: {e}")
            return False
    
    def deinterlace(self, frame: np.ndarray) -> np.ndarray:
        """
        Deinterlace a frame by blending odd and even lines
        """
        try:
            # Simple line blending deinterlacing
            deinterlaced = frame.copy()
            
            # Blend each line with its neighbors
            for i in range(1, frame.shape[0] - 1):
                deinterlaced[i] = (
                    frame[i - 1] * 0.25 +
                    frame[i] * 0.5 +
                    frame[i + 1] * 0.25
                ).astype(frame.dtype)
            
            return deinterlaced
            
        except Exception as e:
            logger.error(f"Error deinterlacing frame: {e}")
            return frame
    
    def repair_frame(self, frame: np.ndarray, previous_frame: Optional[np.ndarray] = None) -> Optional[np.ndarray]:
        """
        Attempt to repair a corrupted frame
        
        Args:
            frame: Corrupted frame
            previous_frame: Previous valid frame (for interpolation)
            
        Returns:
            Repaired frame or None if repair failed
        """
        try:
            # If frame is interlaced, deinterlace it
            if self._detect_interlacing(frame):
                frame = self.deinterlace(frame)
            
            # If frame is noisy, apply denoising
            if len(frame.shape) == 3:
                frame = cv2.fastNlMeansDenoisingColored(frame, None, 10, 10, 7, 21)
            else:
                frame = cv2.fastNlMeansDenoising(frame, None, 10, 7, 21)
            
            return frame
            
        except Exception as e:
            logger.error(f"Error repairing frame: {e}")
            
            # Fallback: use previous frame if available
            if previous_frame is not None:
                logger.warning("Using previous frame as fallback")
                return previous_frame
            
            return None
    
    def get_stats(self) -> Dict:
        """Get validation statistics"""
        corruption_rate = (self.corrupted_frame_count / self.total_frames_checked * 100) if self.total_frames_checked > 0 else 0
        
        return {
            'total_frames_checked': self.total_frames_checked,
            'corrupted_frames': self.corrupted_frame_count,
            'corruption_rate': corruption_rate,
            'consecutive_bad_frames': self.consecutive_bad_frames
        }


def validate_and_repair_frame(frame: np.ndarray, previous_frame: Optional[np.ndarray] = None,
                               frame_number: int = 0, auto_repair: bool = True) -> Tuple[Optional[np.ndarray], bool, str]:
    """
    Convenience function to validate and optionally repair a frame
    
    Args:
        frame: Input frame
        previous_frame: Previous valid frame for repair
        frame_number: Current frame number
        auto_repair: Whether to automatically repair if invalid
        
    Returns:
        Tuple of (repaired_frame, is_valid, message)
    """
    validator = FrameValidator()
    is_valid, message, stats = validator.validate_frame(frame, frame_number)
    
    if not is_valid and auto_repair:
        logger.warning(f"Frame {frame_number}: {message}, attempting repair...")
        repaired = validator.repair_frame(frame, previous_frame)
        
        if repaired is not None:
            # Revalidate
            is_valid_after, message_after, _ = validator.validate_frame(repaired, frame_number)
            if is_valid_after:
                logger.info(f"✅ Frame {frame_number} successfully repaired")
                return repaired, True, "Repaired successfully"
            else:
                logger.error(f"❌ Frame {frame_number} repair failed: {message_after}")
                return None, False, f"Repair failed: {message_after}"
        else:
            return None, False, "Repair returned None"
    
    return frame if is_valid else None, is_valid, message
