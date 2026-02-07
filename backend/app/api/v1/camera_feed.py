"""
Simple camera feed endpoint

Provides a lightweight MJPEG endpoint at `/camera_feed/{identifier}`.
If `identifier` is a number (e.g. `0`) it opens the local webcam index.
Otherwise it will attempt to open the identifier as a stream URL.

This is intentionally minimal for local development and testing.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import cv2
import time
from .video_utils import open_capture

router = APIRouter()


def mjpeg_generator_from_capture(cap):
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            success, buffer = cv2.imencode('.jpg', frame)
            if not success:
                break
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.03)
    finally:
        try:
            cap.release()
        except Exception:
            pass


@router.get('/camera_feed/{identifier}')
def camera_feed(identifier: str):
    """Stream MJPEG frames for a camera.

    ⚠️ NOTE: Webcam devices (0, 1, etc.) should NOT be accessed through this endpoint
    when AI Worker is running, as it causes hardware conflicts.
    
    For webcam cameras being processed by AI Worker:
    - Frontend should connect to AI Worker's stream directly
    - Or use a WebSocket-based approach
    
    This endpoint is for:
    - Network cameras (RTSP, HTTP streams)
    - Recorded video files
    """
    # Numeric index -> BLOCKED to prevent webcam conflicts
    if identifier.isdigit():
        raise HTTPException(
            status_code=409, 
            detail=f"Webcam access blocked. Camera {identifier} is managed by AI Worker. "
                   f"Frontend should use WebSocket stream or wait for AI Worker frames."
        )

    # Otherwise try to open as URL (RTSP, HTTP stream, etc.)
    try:
        cap = open_capture(identifier, width=640, height=480, fps=30)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Unable to open camera stream URL: {e}")
    return StreamingResponse(mjpeg_generator_from_capture(cap), media_type='multipart/x-mixed-replace; boundary=frame')
