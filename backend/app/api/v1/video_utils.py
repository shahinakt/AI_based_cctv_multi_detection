import cv2
import platform
import time


def open_capture(source, width=None, height=None, fps=None, timeout=1.0):
    """Open a cv2.VideoCapture robustly.

    - If `source` is an int or digit string it's treated as a device index.
    - On Windows, prefer CAP_DSHOW then CAP_MSMF then default to avoid MSMF grabFrame issues.
    - For URL streams, try default then allow the caller to pass FFMPEG if desired.
    - Performs a short initial read to validate the capture.
    """
    is_index = False
    try:
        # allow numeric strings
        if isinstance(source, str) and source.isdigit():
            source_i = int(source)
            is_index = True
        elif isinstance(source, int):
            source_i = source
            is_index = True
        else:
            source_i = source
    except Exception:
        source_i = source

    backends_to_try = [None]
    if is_index and platform.system() == "Windows":
        backends_to_try = [cv2.CAP_DSHOW, cv2.CAP_MSMF, None]

    last_err = None
    for backend in backends_to_try:
        try:
            if backend is None:
                cap = cv2.VideoCapture(source_i)
            else:
                cap = cv2.VideoCapture(source_i, backend)

            # small delay for initialization
            time.sleep(0.05)

            if not cap or not cap.isOpened():
                last_err = f"open failed backend={backend}"
                try:
                    if cap:
                        cap.release()
                except Exception:
                    pass
                continue

            # set properties if provided
            if width is not None:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            if height is not None:
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            if fps is not None:
                cap.set(cv2.CAP_PROP_FPS, fps)

            # attempt initial read within timeout
            start = time.time()
            ret = False
            while time.time() - start < timeout:
                ret, _ = cap.read()
                if ret:
                    break
                time.sleep(0.02)

            if not ret:
                last_err = f"initial read failed backend={backend}"
                try:
                    cap.release()
                except Exception:
                    pass
                continue

            return cap

        except Exception as e:
            last_err = str(e)

    raise RuntimeError(f"Cannot open capture {source}: {last_err}")
