
import cv2
from typing import Optional
import numpy as np
import time
import platform


class StreamReader:
    def __init__(self, stream_url: str):
        self.stream_url = stream_url
        self.cap = None

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

                # initial read
                ret, _ = cap.read()
                if not ret:
                    try:
                        cap.release()
                    except Exception:
                        pass
                    last_err = f"initial read failed backend={backend}"
                    continue

                self.cap = cap
                last_err = None
                break
            except Exception as e:
                last_err = str(e)

        if self.cap is None:
            raise ValueError(f"Could not open stream: {stream_url} ({last_err})")

    def read_frame(self) -> Optional[np.ndarray]:
        if not self.cap:
            return None

        ret, frame = self.cap.read()
        if ret:
            return frame

        # Try to reconnect once
        try:
            self.cap.release()
        except Exception:
            pass

        try:
            self.cap = cv2.VideoCapture(self.stream_url)
            time.sleep(0.05)
            ret, frame = self.cap.read()
            return frame if ret else None
        except Exception:
            return None

    def release(self):
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass