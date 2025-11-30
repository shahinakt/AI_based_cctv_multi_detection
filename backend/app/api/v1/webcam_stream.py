"""
backend/app/api/v1/webcam_stream.py
WebSocket-based webcam streaming endpoint for AI worker consumption
Supports multiple concurrent connections with frame broadcasting
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import StreamingResponse
import cv2
import asyncio
import json
import base64
import logging
from typing import Dict, Set
from datetime import datetime
import numpy as np
from .video_utils import open_capture

logger = logging.getLogger(__name__)
router = APIRouter()


class WebcamManager:
    """
    Singleton manager for webcam access
    Handles multiple subscribers to avoid conflicts
    """

    def __init__(self):
        self.cap: cv2.VideoCapture = None
        self.subscribers: Set[WebSocket] = set()
        self.is_streaming = False
        self.lock = asyncio.Lock()
        self.current_frame = None
        self.frame_count = 0
        self.camera_index = 0

    async def start_webcam(self, camera_index: int = 0):
        """Initialize webcam capture"""
        async with self.lock:
            if self.cap is None or not self.cap.isOpened():
                try:
                    self.cap = open_capture(camera_index, width=640, height=480, fps=30)
                except Exception as e:
                    raise RuntimeError(f"Cannot open webcam {camera_index}: {e}")
                self.camera_index = camera_index
                logger.info(f"✅ Webcam {camera_index} opened successfully")

    async def stop_webcam(self):
        """Release webcam when no subscribers"""
        async with self.lock:
            if self.cap and len(self.subscribers) == 0:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None
                self.is_streaming = False
                logger.info("🔴 Webcam released (no subscribers)")

    async def add_subscriber(self, websocket: WebSocket):
        """Add new subscriber"""
        self.subscribers.add(websocket)
        logger.info(f"➕ Subscriber added. Total: {len(self.subscribers)}")

        # Start streaming if first subscriber
        if len(self.subscribers) == 1 and not self.is_streaming:
            asyncio.create_task(self._stream_loop())

    async def remove_subscriber(self, websocket: WebSocket):
        """Remove subscriber"""
        self.subscribers.discard(websocket)
        logger.info(f"➖ Subscriber removed. Total: {len(self.subscribers)}")

        # Stop webcam if no subscribers
        if len(self.subscribers) == 0:
            await self.stop_webcam()

    async def _stream_loop(self):
        """Main streaming loop - broadcasts frames to all subscribers"""
        self.is_streaming = True

        try:
            while self.subscribers:
                if not self.cap or not self.cap.isOpened():
                    await self.start_webcam(self.camera_index)

                ret, frame = self.cap.read()

                if not ret:
                    logger.warning("Failed to read frame, attempting reconnect...")
                    # attempt a quick reconnect to reduce repeated MSMF warnings
                    try:
                        if self.cap:
                            try:
                                self.cap.release()
                            except Exception:
                                pass
                            self.cap = None
                        await asyncio.sleep(0.05)
                        await self.start_webcam(self.camera_index)
                        if not self.cap:
                            await asyncio.sleep(0.5)
                            continue
                        ret, frame = self.cap.read()
                        if not ret:
                            await asyncio.sleep(0.5)
                            continue
                    except Exception as e:
                        logger.error(f"Webcam reconnect failed: {e}")
                        await asyncio.sleep(0.5)
                        continue

                self.current_frame = frame
                self.frame_count += 1

                # Encode frame as JPEG
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frame_base64 = base64.b64encode(buffer).decode('utf-8')

                # Broadcast to all subscribers
                message = json.dumps({
                    'type': 'frame',
                    'data': frame_base64,
                    'timestamp': datetime.utcnow().isoformat(),
                    'frame_number': self.frame_count,
                    'resolution': {'width': frame.shape[1], 'height': frame.shape[0]}
                })

                # Send to all connected subscribers
                dead_subscribers = []
                for subscriber in list(self.subscribers):
                    try:
                        await subscriber.send_text(message)
                    except Exception as e:
                        logger.error(f"Failed to send to subscriber: {e}")
                        dead_subscribers.append(subscriber)

                # Clean up dead connections
                for dead in dead_subscribers:
                    await self.remove_subscriber(dead)

                # Control frame rate (30 FPS = ~33ms per frame)
                await asyncio.sleep(0.033)

        except Exception as e:
            logger.error(f"Streaming loop error: {e}")
        finally:
            self.is_streaming = False
            logger.info("🛑 Streaming loop stopped")


# Global webcam manager
webcam_manager = WebcamManager()


@router.websocket("/stream")
async def webcam_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for webcam streaming
    URL: ws://localhost:8000/api/v1/webcam/stream

    Usage by AI Worker:
    - Connect to WebSocket
    - Receive JSON messages with base64-encoded frames
    - Process frames in real-time
    """
    await websocket.accept()
    logger.info(f"📡 New webcam subscriber connected from {websocket.client}")

    try:
        # Initialize webcam
        await webcam_manager.start_webcam(camera_index=0)

        # Add subscriber
        await webcam_manager.add_subscriber(websocket)

        # Keep connection alive and handle client messages
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)

                # Handle client commands
                if message.get('action') == 'ping':
                    await websocket.send_text(json.dumps({
                        'type': 'pong',
                        'timestamp': datetime.utcnow().isoformat()
                    }))

                elif message.get('action') == 'get_status':
                    await websocket.send_text(json.dumps({
                        'type': 'status',
                        'is_streaming': webcam_manager.is_streaming,
                        'total_subscribers': len(webcam_manager.subscribers),
                        'frame_count': webcam_manager.frame_count
                    }))

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error processing client message: {e}")
                break

    finally:
        await webcam_manager.remove_subscriber(websocket)
        logger.info(f"🔌 Webcam subscriber disconnected")


@router.get("/mjpeg")
async def webcam_mjpeg():
    """
    MJPEG streaming endpoint for browser preview
    URL: http://localhost:8000/api/v1/webcam/mjpeg

    Usage:
    - Direct browser viewing: <img src="http://localhost:8000/api/v1/webcam/mjpeg" />
    - Frontend dashboard preview
    """

    async def generate_frames():
        """Generator for MJPEG stream"""
        # Initialize webcam using helper (prefers DSHOW on Windows)
        try:
            cap = open_capture(0, width=640, height=480, fps=30)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Cannot open webcam: {e}")

        try:
            while True:
                ret, frame = cap.read()

                if not ret:
                    await asyncio.sleep(0.1)
                    continue

                # Encode frame as JPEG
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])

                # Yield frame in MJPEG format
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

                await asyncio.sleep(0.033)  # 30 FPS

        finally:
            try:
                cap.release()
            except Exception:
                pass

    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@router.get("/status")
async def webcam_status():
    """Get webcam streaming status"""
    return {
        'is_streaming': webcam_manager.is_streaming,
        'active_subscribers': len(webcam_manager.subscribers),
        'total_frames': webcam_manager.frame_count,
        'webcam_url': 'ws://localhost:8000/api/v1/webcam/stream',
        'preview_url': 'http://localhost:8000/api/v1/webcam/mjpeg'
    }


@router.post("/test")
async def test_webcam():
    """Test webcam availability"""
    try:
        try:
            cap = open_capture(0)
        except Exception as e:
            return {'available': False, 'error': f'Cannot open webcam: {e}'}

        ret, frame = cap.read()
        try:
            cap.release()
        except Exception:
            pass

        if not ret:
            return {'available': False, 'error': 'Cannot read frame'}

        return {
            'available': True,
            'resolution': {'width': frame.shape[1], 'height': frame.shape[0]},
            'message': 'Webcam is working'
        }
    except Exception as e:
        return {'available': False, 'error': str(e)}