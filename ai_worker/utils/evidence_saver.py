
import cv2
import os
import hashlib
import json
import requests
from typing import Dict, Any
import numpy as np
from collections import deque
import sys

# Add parent directory to path to import config
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import EVIDENCE_DIR

class EvidenceSaver:
    def __init__(self, camera_id: str, buffer_size: int = 90):  # 3 seconds at 30 FPS
        self.camera_id = camera_id
        self.buffer = deque(maxlen=buffer_size)
        # Use EVIDENCE_DIR from config instead of hard-coded path
        self.capture_dir = os.path.join(EVIDENCE_DIR, str(camera_id))
        os.makedirs(self.capture_dir, exist_ok=True)
        print(f"📁 EvidenceSaver initialized - capture_dir: {self.capture_dir}")
        # Correct backend incidents endpoint (use API v1)
        self.backend_url = os.getenv('BACKEND_URL', 'http://localhost:8000') + "/api/v1/incidents/"

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
        
        # Prepare incident payload
        incident_payload = {
            'camera_id': int(self.camera_id) if self.camera_id.isdigit() else 1,
            'type': event.get('type', 'suspicious_behavior'),
            'severity': event.get('severity', 'medium'),
            'severity_score': event.get('severity_score', 50.0),
            'description': event.get('description', f"{event['type']} detected at {timestamp}")
        }
        
        # POST incident to backend
        incident_id = None
        try:
            response = requests.post(self.backend_url, json=incident_payload, timeout=5)
            if response.status_code in [200, 201]:
                incident_data = response.json()
                incident_id = incident_data.get('id')
                print(f"✅ Created incident ID: {incident_id}")
            else:
                print(f"❌ Failed to POST incident: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"❌ Error posting incident to backend: {e}")
        
        # If incident was created successfully, create evidence + blockchain record
        if incident_id:
            evidence_backend_url = self.backend_url.replace('/incidents/', '/evidence/')
            
            # Normalize file path - convert backslashes to forward slashes for URLs
            # Get relative path from EVIDENCE_DIR for proper URL construction
            relative_snapshot_path = os.path.relpath(snapshot_path, EVIDENCE_DIR).replace('\\', '/')
            
            print(f"📸 Evidence paths:")
            print(f"  Full path: {snapshot_path}")
            print(f"  Relative path: {relative_snapshot_path}")
            print(f"  EVIDENCE_DIR: {EVIDENCE_DIR}")
            
            # Create evidence for snapshot
            snapshot_evidence = {
                'incident_id': incident_id,
                'file_path': relative_snapshot_path,  # Store relative path for URL construction
                'sha256_hash': sha256,
                'file_type': 'image',
                'extra_metadata': {
                    'timestamp': timestamp,
                    'camera_id': self.camera_id,
                    'event_type': event['type']
                }
            }
            
            try:
                print(f"📤 Posting evidence to: {evidence_backend_url}")
                print(f"   Payload: {json.dumps(snapshot_evidence, indent=2)}")
                response = requests.post(evidence_backend_url, json=snapshot_evidence, timeout=5)
                if response.status_code in [200, 201]:
                    print(f"✅ Created evidence for incident {incident_id}")
                    print(f"   Response: {response.json()}")
                else:
                    print(f"❌ Failed to POST evidence: {response.status_code} - {response.text}")
            except Exception as e:
                print(f"❌ Error posting evidence to backend: {e}")

            # ----------------------------------------------------------------
            # BLOCKCHAIN INTEGRITY: Register auto-generated evidence
            # Create blockchain record immediately after evidence is stored.
            # Sends the RELATIVE path so the backend stores a portable value.
            # Authenticates with AI_WORKER_SERVICE_KEY so the internal
            # endpoint is protected even when the backend is internet-exposed.
            # ----------------------------------------------------------------
            try:
                blockchain_url = (
                    os.getenv('BACKEND_URL', 'http://localhost:8000')
                    + "/api/v1/admin/internal/create-blockchain-record"
                )
                blockchain_payload = {
                    "incident_id": incident_id,
                    "evidence_path": relative_snapshot_path,  # Relative – portable
                }
                blockchain_headers = {
                    "X-AI-Worker-Secret": os.getenv(
                        "AI_WORKER_SERVICE_KEY",
                        "ai-worker-secret-key-change-in-production",
                    ),
                }
                bc_response = requests.post(
                    blockchain_url,
                    json=blockchain_payload,
                    headers=blockchain_headers,
                    timeout=5,
                )
                if bc_response.status_code in [200, 201]:
                    bc_data = bc_response.json()
                    print(
                        f"⛓️  Blockchain record created for incident {incident_id} "
                        f"(hash={bc_data.get('evidence_hash', '')[:16]}…)"
                    )
                else:
                    print(
                        f"⚠️  Blockchain record creation returned "
                        f"{bc_response.status_code}: {bc_response.text[:200]}"
                    )
            except Exception as bc_err:
                # Blockchain registration is non-critical – log and continue
                print(f"⚠️  Could not register blockchain record: {bc_err}")
        
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