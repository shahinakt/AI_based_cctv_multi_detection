"""
ai_worker/inference/websocket_stream_worker.py - NEW FILE
WebSocket stream consumer for webcam and HTTP streams
Supports both traditional RTSP and WebSocket-based streams
"""
import cv2
import numpy as np
import base64
import json
import asyncio
import websockets
import logging
from typing import Optional
import time

logger = logging.getLogger(__name__)


class WebSocketStreamReader:
    """
    Read frames from WebSocket stream (webcam or other HTTP sources)
    Compatible with SingleCameraWorker interface
    """
    
    def __init__(self, websocket_url: str):
        self.websocket_url = websocket_url
        self.ws = None
        self.current_frame = None
        self.frame_count = 0
        self.is_connected = False
        self.last_frame_time = time.time()
        
    async def connect(self):
        """Connect to WebSocket stream"""
        try:
            self.ws = await websockets.connect(self.websocket_url)
            self.is_connected = True
            logger.info(f"✅ Connected to WebSocket: {self.websocket_url}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to connect to WebSocket: {e}")
            self.is_connected = False
            return False
    
    async def read_frame(self) -> Optional[np.ndarray]:
        """
        Read next frame from WebSocket stream
        Returns: numpy array (BGR format) or None
        """
        if not self.is_connected:
            await self.connect()
        
        try:
            # Receive frame with timeout
            message_str = await asyncio.wait_for(self.ws.recv(), timeout=5.0)
            message = json.loads(message_str)
            
            if message.get('type') == 'frame':
                # Decode base64 frame
                frame_base64 = message['data']
                frame_bytes = base64.b64decode(frame_base64)
                
                # Convert to numpy array
                nparr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is not None:
                    self.current_frame = frame
                    self.frame_count += 1
                    self.last_frame_time = time.time()
                    return frame
            
            return None
            
        except asyncio.TimeoutError:
            logger.warning("WebSocket read timeout")
            return None
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket connection closed")
            self.is_connected = False
            return None
        except Exception as e:
            logger.error(f"Error reading WebSocket frame: {e}")
            return None
    
    async def close(self):
        """Close WebSocket connection"""
        if self.ws:
            await self.ws.close()
            self.is_connected = False
            logger.info("WebSocket connection closed")
    
    def __del__(self):
        """Cleanup on deletion"""
        if self.ws and self.is_connected:
            try:
                asyncio.create_task(self.close())
            except Exception:
                pass


class UnifiedStreamReader:
    """
    Unified stream reader supporting:
    - RTSP URLs (rtsp://)
    - HTTP MJPEG streams (http://)
    - WebSocket streams (ws://)
    - Local webcam (0, 1, 2)
    """
    
    def __init__(self, stream_url: str):
        self.stream_url = stream_url
        self.reader = None
        self.stream_type = self._detect_stream_type()
        
    def _detect_stream_type(self) -> str:
        """Detect stream type from URL"""
        url = str(self.stream_url).lower()
        
        if url.startswith('ws://') or url.startswith('wss://'):
            return 'websocket'
        elif url.startswith('rtsp://'):
            return 'rtsp'
        elif url.startswith('http://') or url.startswith('https://'):
            return 'http'
        elif url.isdigit():
            return 'webcam'
        else:
            return 'unknown'
    
    def open(self):
        """Open stream based on type"""
        logger.info(f"Opening stream: {self.stream_url} (type: {self.stream_type})")
        
        if self.stream_type == 'websocket':
            # Use WebSocket reader
            self.reader = WebSocketStreamReader(self.stream_url)
            # Note: Async connection happens in read_frame()
            return True
        
        else:
            # Use OpenCV VideoCapture for RTSP/HTTP/webcam with backend fallbacks
            try:
                # determine backends to try for webcam on Windows
                if self.stream_type == 'webcam':
                    stream_index = int(self.stream_url)
                    backends = [None]
                    try:
                        import platform
                        if platform.system() == 'Windows':
                            backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, None]
                    except Exception:
                        backends = [None]

                    opened = False
                    for backend in backends:
                        try:
                            if backend is None:
                                reader = cv2.VideoCapture(stream_index)
                            else:
                                reader = cv2.VideoCapture(stream_index, backend)

                            time.sleep(0.05)
                            if not reader or not reader.isOpened():
                                try:
                                    reader.release()
                                except Exception:
                                    pass
                                continue

                            # quick initial read
                            ret, _ = reader.read()
                            if not ret:
                                try:
                                    reader.release()
                                except Exception:
                                    pass
                                continue

                            self.reader = reader
                            opened = True
                            break
                        except Exception:
                            continue

                    if not opened:
                        logger.error(f"Failed to open webcam stream: {self.stream_url}")
                        return False

                else:
                    # non-webcam stream (rtsp/http) - try default open
                    self.reader = cv2.VideoCapture(self.stream_url)
                    time.sleep(0.05)
                    if not self.reader or not self.reader.isOpened():
                        logger.error(f"Failed to open stream: {self.stream_url}")
                        return False

                # Configure capture
                try:
                    self.reader.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency
                except Exception:
                    pass

                logger.info(f"✅ Stream opened: {self.stream_url}")
                return True
                
            except Exception as e:
                logger.error(f"Error opening stream: {e}")
                return False
    
    def read_frame(self) -> Optional[np.ndarray]:
        """
        Read next frame (unified interface)
        Returns: numpy array (BGR format) or None
        """
        if self.stream_type == 'websocket':
            # Async read - use event loop
            if not hasattr(self, '_loop'):
                self._loop = asyncio.new_event_loop()
            
            try:
                frame = self._loop.run_until_complete(self.reader.read_frame())
                return frame
            except Exception as e:
                logger.error(f"WebSocket read error: {e}")
                return None
        
        else:
            # OpenCV read
            if not self.reader or not self.reader.isOpened():
                return None
            
            ret, frame = self.reader.read()
            return frame if ret else None

    def read(self):
        """Compatibility wrapper to emulate cv2.VideoCapture.read()

        Returns a tuple (ret: bool, frame: Optional[np.ndarray])
        """
        if self.stream_type == 'websocket':
            try:
                frame = self.read_frame()
                return (True, frame) if frame is not None else (False, None)
            except Exception as e:
                logger.error(f"WebSocket read error: {e}")
                return (False, None)

        # For OpenCV-backed readers, forward to their read()
        if not self.reader:
            return (False, None)

        try:
            ret, frame = self.reader.read()
            return (ret, frame)
        except Exception as e:
            logger.error(f"Error reading from stream reader: {e}")
            return (False, None)

    def set(self, prop, value):
        """Expose cv2.VideoCapture.set for compatibility with existing code.

        If the underlying reader isn't opened yet, attempt to open it first.
        For websocket streams this is a no-op and returns False.
        """
        if self.stream_type == 'websocket':
            # WebSocket reader does not support cv2 properties
            return False

        # Ensure reader is opened
        if not self.reader:
            opened = self.open()
            if not opened:
                return False

        if hasattr(self.reader, 'set'):
            try:
                return self.reader.set(prop, value)
            except Exception as e:
                logger.warning(f"Failed to set property on stream reader: {e}")
                return False

        return False
    
    def release(self):
        """Release stream resources"""
        if self.stream_type == 'websocket':
            if hasattr(self, '_loop'):
                self._loop.run_until_complete(self.reader.close())
                self._loop.close()
        else:
            if self.reader:
                self.reader.release()
        
        logger.info(f"Stream released: {self.stream_url}")
    
    def isOpened(self) -> bool:
        """Check if stream is open"""
        if self.stream_type == 'websocket':
            return self.reader and self.reader.is_connected
        else:
            return self.reader and self.reader.isOpened()


# Example usage in SingleCameraWorker
def integrate_with_camera_worker():
    """
    How to integrate UnifiedStreamReader with SingleCameraWorker
    """
    
    # Replace this in ai_worker/inference/single_camera_worker.py:
    # 
    # OLD:
    # self.cap = cv2.VideoCapture(self.stream_url)
    # 
    # NEW:
    # from ai_worker.inference.websocket_stream_worker import UnifiedStreamReader
    # self.cap = UnifiedStreamReader(self.stream_url)
    # 
    # The rest of the code remains the same!
    # UnifiedStreamReader has the same interface as cv2.VideoCapture
    
    pass


# Standalone test
async def test_websocket_stream():
    """Test WebSocket stream reading"""
    reader = WebSocketStreamReader("ws://localhost:8000/api/v1/webcam/stream")
    
    await reader.connect()
    
    for i in range(30):  # Read 30 frames
        frame = await reader.read_frame()
        
        if frame is not None:
            print(f"Frame {i}: {frame.shape}")
        else:
            print(f"Frame {i}: Failed")
        
        await asyncio.sleep(0.1)
    
    await reader.close()


if __name__ == '__main__':
    # Test WebSocket stream
    asyncio.run(test_websocket_stream())