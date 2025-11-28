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

    - If `identifier` is digits, treat as local device index (0, 1, ...).
    - Otherwise try to open it as a stream URL with OpenCV.
    """
    # Numeric index -> open local camera device
    if identifier.isdigit():
        idx = int(identifier)
        cap = cv2.VideoCapture(idx)
        if not cap.isOpened():
            raise HTTPException(status_code=404, detail=f"Unable to open local camera index {idx}")
        return StreamingResponse(mjpeg_generator_from_capture(cap), media_type='multipart/x-mixed-replace; boundary=frame')

    # Otherwise try to open as URL
    cap = cv2.VideoCapture(identifier)
    if not cap.isOpened():
        raise HTTPException(status_code=404, detail="Unable to open camera stream URL")
    return StreamingResponse(mjpeg_generator_from_capture(cap), media_type='multipart/x-mixed-replace; boundary=frame')
