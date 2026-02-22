
import cv2
from typing import Optional
import numpy as np
import time
import platform
import logging
from .frame_validator import FrameValidator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class StreamReader:
    def __init__(self, stream_url: str, enable_validation: bool = True, enable_deinterlacing: bool = True):
        self.stream_url = stream_url
        self.cap = None
        self.enable_validation = enable_validation
        self.enable_deinterlacing = enable_deinterlacing
        self.frame_validator = FrameValidator() if enable_validation else None
        self.last_valid_frame = None
        self.frame_count = 0

        # If stream_url is numeric -> local webcam index
        try:
            if isinstance(stream_url, str) and stream_url.isdigit():
                idx = int(stream_url)
            elif isinstance(stream_url, int):
                idx = stream_url
            else:
                idx = None
        except Exception:
            idx = None

        if idx is not None and platform.system() == 'Windows':
            # Try DSHOW then MSMF then default
            backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, None]
        else:
            backends = [None]

        last_err = None
        for backend in backends:
            try:
                if backend is None:
                    cap = cv2.VideoCapture(stream_url)
                else:
                    cap = cv2.VideoCapture(idx, backend)

                time.sleep(0.05)
                if not cap or not cap.isOpened():
                    try:
                        cap.release()
                    except Exception:
                        pass
                    last_err = f"open failed backend={backend}"
                    continue

                # Set buffer size to reduce latency and avoid old frames
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                
                # initial read
                ret, test_frame = cap.read()
                if not ret:
                    try:
                        cap.release()
                    except Exception:
                        pass
                    last_err = f"initial read failed backend={backend}"
                    continue
                
                # Validate initial frame
                if self.frame_validator:
                    is_valid, message, _ = self.frame_validator.validate_frame(test_frame, 0)
                    if not is_valid:
                        logger.warning(f"Initial frame invalid ({message}), trying next backend...")
                        try:
                            cap.release()
                        except Exception:
                            pass
                        last_err = f"initial frame invalid: {message}"
                        continue

                self.cap = cap
                last_err = None
                logger.info(f"✅ Stream opened successfully with backend: {backend}")
                break
            except Exception as e:
                last_err = str(e)

        if self.cap is None:
            raise ValueError(f"Could not open stream: {stream_url} ({last_err})")

    def read_frame(self) -> Optional[np.ndarray]:
        """Read and validate a frame from the stream"""
        if not self.cap:
            return None

        ret, frame = self.cap.read()
        self.frame_count += 1
        
        if not ret:
            # Try to reconnect once
            logger.warning(f"Failed to read frame {self.frame_count}, attempting reconnect...")
            try:
                self.cap.release()
            except Exception:
                pass

            try:
                self.cap = cv2.VideoCapture(self.stream_url)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                time.sleep(0.05)
                ret, frame = self.cap.read()
                if not ret:
                    return None
            except Exception as e:
                logger.error(f"Reconnection failed: {e}")
                return None
        
        # Validate and repair frame if enabled
        if self.frame_validator and frame is not None:
            is_valid, message, stats = self.frame_validator.validate_frame(frame, self.frame_count)
            
            if not is_valid:
                logger.warning(f"Frame {self.frame_count} invalid: {message}")
                
                # Attempt repair
                repaired_frame = self.frame_validator.repair_frame(frame, self.last_valid_frame)
                
                if repaired_frame is not None:
                    # Revalidate repaired frame
                    is_valid_after, _, _ = self.frame_validator.validate_frame(repaired_frame, self.frame_count)
                    
                    if is_valid_after:
                        logger.info(f"✅ Frame {self.frame_count} repaired successfully")
                        frame = repaired_frame
                    else:
                        # Use last valid frame as fallback
                        if self.last_valid_frame is not None:
                            logger.warning(f"Using last valid frame as fallback")
                            frame = self.last_valid_frame.copy()
                        else:
                            return None
                else:
                    # Repair failed, use last valid frame
                    if self.last_valid_frame is not None:
                        logger.warning(f"Using last valid frame as fallback")
                        frame = self.last_valid_frame.copy()
                    else:
                        return None
            
            # Deinterlace if needed
            if self.enable_deinterlacing and self.frame_validator._detect_interlacing(frame):
                frame = self.frame_validator.deinterlace(frame)
            
            # Store as last valid frame
            if is_valid:
                self.last_valid_frame = frame.copy()
        
        return frame
    
    def get_validation_stats(self) -> dict:
        """Get frame validation statistics"""
        if self.frame_validator:
            return self.frame_validator.get_stats()
        return {}

    def release(self):
        """Release the capture and log statistics"""
        if self.frame_validator:
            stats = self.frame_validator.get_stats()
            logger.info(f"📊 Stream validation stats: {stats}")
        
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass