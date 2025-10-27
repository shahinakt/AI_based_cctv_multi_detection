# ai_worker/utils/evidence_saver.py
import cv2
import os
import hashlib
import json
import requests
from typing import Dict, Any
import numpy as np
from collections import deque

class EvidenceSaver:
    def __init__(self, camera_id: str, buffer_size: int = 90):  # 3 seconds at 30 FPS
        self.camera_id = camera_id
        self.buffer = deque(maxlen=buffer_size)
        self.capture_dir = f"data/captures/{camera_id}"
        os.makedirs(self.capture_dir, exist_ok=True)
        self.backend_url = "http://localhost:8000/api/incidents"  # From config

    async def save_event(self, event: Dict[str, Any], current_frame: np.ndarray):
        # Save pre-event buffer + current frame as video
        timestamp = event['timestamp']
        video_path = os.path.join(self.capture_dir, f"event_{timestamp}.mp4")
        self._save_video(list(self.buffer) + [current_frame], video_path)
        
        # Save snapshot
        snapshot_path = os.path.join(self.capture_dir, f"snapshot_{timestamp}.jpg")
        cv2.imwrite(snapshot_path, current_frame)
        
        # Compute SHA-256
        with open(snapshot_path, 'rb') as f:
            sha256 = hashlib.sha256(f.read()).hexdigest()
        
        # Prepare metadata
        metadata = {
            'camera_id': self.camera_id,
            'event_type': event['type'],
            'timestamp': timestamp,
            'severity': event.get('severity', 'unknown'),
            'snapshot_path': snapshot_path,
            'video_path': video_path,
            'sha256': sha256,
            'location': event['location']
        }
        
        # POST to backend
        try:
            response = requests.post(self.backend_url, json=metadata)
            if response.status_code != 200:
                print(f"Failed to POST metadata: {response.text}")
        except Exception as e:
            print(f"Error posting to backend: {e}")
        
        # Clear buffer after event
        self.buffer.clear()

    def _save_video(self, frames: list, output_path: str, fps: int = 30):
        if not frames:
            return
        height, width = frames[0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        for frame in frames:
            out.write(frame)
        out.release()

    def add_to_buffer(self, frame: np.ndarray):
        self.buffer.append(frame.copy())