"""
ai_worker/inference/single_camera_worker.py - ENHANCED VERSION
Continuous camera processing with improved incident detection
Sends incidents to backend in real-time
"""

import cv2
import time
import logging
import os
import hashlib
from datetime import datetime  # optional, if you don't use it you can remove this
import requests
from typing import List, Dict

from ai_worker.inference.fall_detector import SmartFallDetector
from ai_worker.inference.theft_detector import SmartTheftDetector
from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.inference.incident_detector import IncidentDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Backend API configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
EVIDENCE_DIR = os.getenv("EVIDENCE_DIR", "../data/captures")


class SingleCameraWorker:
    """
    Enhanced camera worker with:
    - Continuous stream processing
    - Improved incident detection
    - Real-time backend communication
    - Evidence management
    """

    def __init__(self, camera_id: int, config: dict):
        """
        Initialize camera worker

        Args:
            camera_id: Unique camera identifier (database ID)
            config: Camera configuration:
                - stream_url: RTSP URL or webcam ID
                - name: Camera name
                - device: 'cuda:0' or 'cpu'
                - resolution: (width, height)
                - process_every_n_frames: Frame skip rate
                - enable_incidents: Enable incident detection
        """
        self.camera_id = camera_id
        self.config = config
        self.device = config.get("device", "cpu")
        self.stream_url = config["stream_url"]
        self.resolution = config.get("resolution", (640, 480))
        self.process_every_n = config.get("process_every_n_frames", 1)
        self.name = config.get("name", f"Camera_{camera_id}")

        # Performance tracking
        self.frame_count = 0
        self.detection_count = 0
        self.incident_count = 0
        self.fps_list: List[float] = []
        self.start_time = time.time()

        # Components (initialized in run())
        self.detector: YOLODetector | None = None
        self.incident_detector: IncidentDetector | None = None
        self.cap = None

        # Evidence directory
        self.evidence_dir = os.path.join(EVIDENCE_DIR, f"camera_{camera_id}")
        os.makedirs(self.evidence_dir, exist_ok=True)

        # Initialize smart detectors
        self.fall_detector = SmartFallDetector(f"camera_{camera_id}")
        self.theft_detector = SmartTheftDetector(f"camera_{camera_id}")

    def run(self):
        """Main processing loop"""
        logger.info(f"🚀 Starting {self.name} (ID: {self.camera_id})")
        logger.info(f"   Device: {self.device}")
        logger.info(f"   Stream: {self.stream_url}")
        logger.info(f"   Resolution: {self.resolution}")

        # Update backend status: starting
        self._update_backend_status("starting")

        # Initialize detector
        try:
            logger.info(f"Loading YOLO on {self.device}...")
            self.detector = YOLODetector("yolov8n.pt", device=self.device)
            logger.info("✅ Detector loaded")
        except Exception as e:
            logger.error(f"❌ Failed to load detector: {e}")
            self._update_backend_status("error", error_msg=str(e))
            return

        # Initialize incident detector
        try:
            self.incident_detector = IncidentDetector(
                camera_id=f"camera_{self.camera_id}",
                alert_cooldown=5.0,
            )
            logger.info("✅ Incident detector initialized")
        except Exception as e:
            logger.error(f"❌ Failed to load incident detector: {e}")
            self._update_backend_status("error", error_msg=str(e))
            return

        # Open video stream
        try:
            self.cap = cv2.VideoCapture(self.stream_url)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])

            if not self.cap.isOpened():
                raise Exception("Cannot open stream")

            logger.info("✅ Stream opened")

        except Exception as e:
            logger.error(f"❌ Failed to open stream: {e}")
            self._update_backend_status("error", error_msg=str(e))
            return

        # Update status: running
        self._update_backend_status("running")

        # Start processing
        logger.info("🎬 Processing started...")

        try:
            self._processing_loop()
        except KeyboardInterrupt:
            logger.info("⚠️ Interrupted by user")
        except Exception as e:
            logger.error(f"❌ Processing error: {e}")
            self._update_backend_status("error", error_msg=str(e))
        finally:
            self._cleanup()

    def _processing_loop(self):
        """Main frame processing loop"""
        detections: List[Dict] = []

        while True:
            loop_start = time.time()

            # Read frame
            ret, frame = self.cap.read()
            if not ret:
                logger.warning("⚠️ Failed to read frame, reconnecting...")
                self._reconnect()
                continue

            self.frame_count += 1

            # Process every Nth frame
            if self.frame_count % self.process_every_n == 0:
                try:
                    # Run YOLO detection with optimized confidence threshold
                    detection_start = time.time()
                    detections = self.detector.predict(
                        frame,
                        conf=0.6,  # Higher confidence for fewer false positives
                        iou=0.45,
                    )
                    detection_time = (time.time() - detection_start) * 1000

                    self.detection_count += len(detections)

                    # Run incident detection
                    incident_start = time.time()
                    incidents = self.incident_detector.analyze_frame(
                        detections, frame, self.frame_count
                    )
                    incident_time = (time.time() - incident_start) * 1000  # noqa: F841

                    # Handle incidents
                    if incidents:
                        self.incident_count += len(incidents)
                        self._handle_incidents(incidents, frame, detections)

                    # Calculate FPS
                    loop_time = time.time() - loop_start
                    fps = 1 / loop_time if loop_time > 0 else 0
                    self.fps_list.append(fps)

                    # Update backend status every ~30 processed frames
                    if (self.frame_count // self.process_every_n) % 30 == 0:
                        last_n = min(len(self.fps_list), 30)
                        avg_fps = (
                            sum(self.fps_list[-last_n:]) / last_n if last_n > 0 else 0.0
                        )

                        self._update_backend_status(
                            "running",
                            fps=avg_fps,
                            total_frames=self.frame_count,
                            total_incidents=self.incident_count,
                        )

                        logger.info(
                            f"{self.name} | "
                            f"Frame: {self.frame_count} | "
                            f"FPS: {avg_fps:.1f} | "
                            f"Detect: {detection_time:.0f}ms | "
                            f"Objects: {len(detections)} | "
                            f"Incidents: {self.incident_count}"
                        )

                except Exception as e:
                    logger.error(f"❌ Processing error: {e}")
                    continue

    def _handle_incidents(self, incidents: List[Dict], frame, detections: List[Dict]):
        """
        Handle detected incidents:
        1. Save evidence (snapshot + metadata)
        2. Send to backend API
        3. Log incident
        """
        for incident in incidents:
            # Log incident
            logger.warning(
                f"🚨 {self.name} | "
                f"{incident['type'].upper()} | "
                f"Severity: {incident['severity']} | "
                f"Confidence: {incident['confidence']:.2f} | "
                f"{incident['description']}"
            )

            # Save evidence snapshot
            evidence_path = self._save_evidence(incident, frame, detections)

            # Send to backend
            self._send_incident_to_backend(incident, evidence_path)

    def _save_evidence(
        self, incident: Dict, frame, detections: List[Dict]
    ) -> str:
        """
        Save evidence snapshot with bounding boxes

        Returns:
            Relative file path for database storage
        """
        try:
            # Draw detections on frame
            evidence_frame = frame.copy()

            for det in detections:
                bbox = [int(x) for x in det["bbox"]]
                label = f"{det['class_name']} {det['conf']:.2f}"

                cv2.rectangle(
                    evidence_frame,
                    (bbox[0], bbox[1]),
                    (bbox[2], bbox[3]),
                    (0, 255, 0),
                    2,
                )
                cv2.putText(
                    evidence_frame,
                    label,
                    (bbox[0], bbox[1] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 0),
                    2,
                )

            # Add incident info overlay
            cv2.putText(
                evidence_frame,
                f"{incident['type']} - {incident['severity']}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 0, 255),
                2,
            )

            # Save file
            timestamp = int(time.time())
            filename = f"{incident['type']}_{timestamp}.jpg"
            filepath = os.path.join(self.evidence_dir, filename)

            cv2.imwrite(filepath, evidence_frame, [cv2.IMWRITE_JPEG_QUALITY, 95])

            # Compute SHA256 (for logging / verification)
            with open(filepath, "rb") as f:
                sha256 = hashlib.sha256(f.read()).hexdigest()
            logger.info(f"💾 Evidence saved: {filepath} | SHA256: {sha256}")

            # Return relative path for database
            return f"camera_{self.camera_id}/{filename}"

        except Exception as e:
            logger.error(f"Failed to save evidence: {e}")
            return ""

    def _send_incident_to_backend(self, incident: Dict, evidence_path: str):
        """Send incident to backend API"""
        try:
            # Map incident type to backend enum
            type_mapping = {
                "fall_detected": "fall_health",
                "potential_violence": "abuse_violence",
                "potential_theft": "theft",
                "intrusion": "abuse_violence",
                "loitering": "theft",
                "health_emergency": "fall_health",
            }

            incident_type = type_mapping.get(incident["type"], "abuse_violence")

            # Create incident payload
            incident_payload = {
                "camera_id": self.camera_id,
                "type": incident_type,
                "severity": incident["severity"],
                "severity_score": float(incident["confidence"] * 100),
                "description": incident["description"],
            }

            # Send incident
            response = requests.post(
                f"{BACKEND_URL}/api/v1/incidents/",
                json=incident_payload,
                timeout=5,
            )

            if response.status_code in [200, 201]:
                incident_data = response.json()
                incident_id = incident_data["id"]

                logger.info(f"✅ Incident sent to backend (ID: {incident_id})")

                # Send evidence if saved
                if evidence_path:
                    self._send_evidence_to_backend(incident_id, evidence_path)
            else:
                logger.error(f"Failed to send incident: {response.text}")

        except Exception as e:
            logger.error(f"Failed to send incident to backend: {e}")

    def _send_evidence_to_backend(self, incident_id: int, evidence_path: str):
        """Send evidence metadata to backend"""
        try:
            full_path = os.path.join(EVIDENCE_DIR, evidence_path)
            with open(full_path, "rb") as f:
                sha256 = hashlib.sha256(f.read()).hexdigest()

            evidence_payload = {
                "incident_id": incident_id,
                "file_path": evidence_path,
                "sha256_hash": sha256,
                "file_type": "image",
                "metadata_": {
                    "camera_id": self.camera_id,
                    "frame_number": self.frame_count,
                },
            }

            response = requests.post(
                f"{BACKEND_URL}/api/v1/evidence/",
                json=evidence_payload,
                timeout=5,
            )

            if response.status_code in [200, 201]:
                logger.info("✅ Evidence sent to backend")
            else:
                logger.error(f"Failed to send evidence: {response.text}")

        except Exception as e:
            logger.error(f"Failed to send evidence: {e}")

    def _update_backend_status(
        self,
        status: str,
        error_msg: str | None = None,
        fps: float | None = None,
        total_frames: int | None = None,
        total_incidents: int | None = None,
    ):
        """Update camera status in backend database"""
        try:
            payload = {
                "status": status,
                "error_message": error_msg,
                "fps": fps or 0.0,
                "total_frames": total_frames or self.frame_count,
                "total_incidents": total_incidents or self.incident_count,
                "processing_device": self.device,
            }

            response = requests.put(
                f"{BACKEND_URL}/api/v1/cameras/{self.camera_id}/status",
                json=payload,
                timeout=5,
            )

            if response.status_code != 200:
                logger.warning(
                    f"Failed to update backend status: {response.status_code} - {response.text}"
                )

        except Exception as e:
            logger.warning(f"Failed to update backend status: {e}")

    def _reconnect(self):
        """Attempt to reconnect to stream"""
        logger.info("🔄 Attempting reconnection...")

        if self.cap:
            self.cap.release()

        time.sleep(2)  # Wait before reconnecting

        self.cap = cv2.VideoCapture(self.stream_url)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])

        if self.cap.isOpened():
            logger.info("✅ Reconnected")
        else:
            logger.error("❌ Reconnection failed")
            self._update_backend_status("error", error_msg="Stream disconnected")

    def _cleanup(self):
        """Cleanup resources"""
        logger.info(f"🧹 Cleaning up {self.name}...")

        if self.cap:
            self.cap.release()

        cv2.destroyAllWindows()

        # Update backend status: stopped
        self._update_backend_status("stopped")

        # Print final stats
        if self.frame_count > 0:
            runtime = time.time() - self.start_time
            avg_fps = sum(self.fps_list) / len(self.fps_list) if self.fps_list else 0

            logger.info(
                f"📊 {self.name} Final Stats:\n"
                f"   Runtime: {runtime:.0f}s\n"
                f"   Frames processed: {self.frame_count}\n"
                f"   Average FPS: {avg_fps:.1f}\n"
                f"   Total detections: {self.detection_count}\n"
                f"   Total incidents: {self.incident_count}"
            )


def start_camera_process(camera_id: int, config: dict):
    """
    Start a single camera worker.

    This function is meant to be used as the target of a multiprocessing.Process
    in multi_camera_worker.py.
    """
    try:
        worker = SingleCameraWorker(camera_id, config)
        worker.run()
    except Exception as e:
        logger.error(f"Camera process {camera_id} crashed: {e}")
