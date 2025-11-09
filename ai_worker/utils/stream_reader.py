
import cv2
from typing import Optional
import numpy as np

class StreamReader:
    def __init__(self, stream_url: str):
        self.stream_url = stream_url
        self.cap = cv2.VideoCapture(stream_url)
        if not self.cap.isOpened():
            raise ValueError(f"Could not open stream: {stream_url}")

    def read_frame(self) -> Optional[np.ndarray]:
        ret, frame = self.cap.read()
        if ret:
            return frame
        else:
            # Try to reconnect
            self.cap.release()
            self.cap = cv2.VideoCapture(self.stream_url)
            ret, frame = self.cap.read()
            return frame if ret else None

    def release(self):
        self.cap.release()