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
import json
from datetime import datetime  # optional, if you don't use it you can remove this
import requests
from typing import List, Dict, Optional

from ai_worker.inference.websocket_stream_worker import UnifiedStreamReader
from ai_worker import config as worker_config
from ai_worker.inference.fall_detector import SmartFallDetector
from ai_worker.inference.theft_detector import SmartTheftDetector
from ai_worker.models.yolo_detector import YOLODetector
from pathlib import Path
import os
from ai_worker.inference.incident_detector import IncidentDetector
from ai_worker.utils.frame_validator import FrameValidator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Backend API configuration
BACKEND_URL = os.getenv("BACKEND_URL", getattr(worker_config, "BACKEND_URL", "http://localhost:8000"))
EVIDENCE_DIR = os.getenv("EVIDENCE_DIR", getattr(worker_config, "EVIDENCE_DIR", "data/captures"))
BACKEND_API_KEY = getattr(worker_config, "BACKEND_API_KEY", os.getenv("BACKEND_API_KEY", ""))


def _build_headers():
    """Return headers including Authorization if API key is configured."""
    if BACKEND_API_KEY:
        return {"Authorization": f"Bearer {BACKEND_API_KEY}"}
    return {}


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
        
        # Frame validation
        self.frame_validator = FrameValidator()
        self.last_valid_frame: Optional = None
        self.corrupted_frame_count = 0

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
        logger.info(f"   Backend: {BACKEND_URL}")
        logger.info(f"   Resolution: {self.resolution}")

        # Update backend status: starting
        self._update_backend_status("starting")

        # Initialize detector
        try:
            logger.info(f"Loading YOLO on {self.device}...")
            # Resolve model path: prefer YOLO_MODEL_PATH env var, then ai_worker/yolov8n.pt, then repo root yolov8n.pt
            model_env = os.getenv("YOLO_MODEL_PATH")
            if model_env and Path(model_env).exists():
                model_path = model_env
            else:
                # ai_worker package root
                pkg_root = Path(__file__).resolve().parents[2]
                candidate1 = pkg_root / "yolov8n.pt"
                candidate2 = Path(__file__).resolve().parents[3] / "yolov8n.pt"
                if candidate1.exists():
                    model_path = str(candidate1)
                elif candidate2.exists():
                    model_path = str(candidate2)
                else:
                    # fallback to provided name and let YOLODetector raise a clear error
                    model_path = "yolov8n.pt"

            logger.info(f"Using YOLO model path: {model_path}")
            self.detector = YOLODetector(model_path, device=self.device)
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
            self.cap = UnifiedStreamReader(self.stream_url)

            # Explicitly open the underlying reader (handles webcam/rtsp/http/websocket)
            opened = False
            try:
                opened = self.cap.open()
            except Exception:
                opened = False

            # Try to set resolution for OpenCV-backed readers
            try:
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
            except Exception:
                # Some readers (websocket) may not support set(); ignore
                pass

            if not opened or not self.cap.isOpened():
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
            # Ensure the capture is opened before attempting to read
            if not self.cap or not self.cap.isOpened():
                logger.warning("⚠️ Stream not opened, attempting reconnect...")
                self._reconnect()
                time.sleep(0.5)
                continue
            loop_start = time.time()

            # Read frame
            try:
                ret, frame = self.cap.read()
            except Exception as e:
                logger.warning(f"⚠️ Error reading from stream: {e}; reconnecting...")
                self._reconnect()
                continue
            if not ret:
                logger.warning("⚠️ Failed to read frame, reconnecting...")
                self._reconnect()
                continue

            self.frame_count += 1
            
            # ✅ ENHANCED: Validate and repair frame
            is_valid, validation_message, frame_stats = self.frame_validator.validate_frame(frame, self.frame_count)
            
            if not is_valid:
                logger.warning(f"Frame {self.frame_count} validation failed: {validation_message}")
                self.corrupted_frame_count += 1
                
                # Attempt repair
                repaired_frame = self.frame_validator.repair_frame(frame, self.last_valid_frame)
                
                if repaired_frame is not None:
                    # Revalidate
                    is_valid_after, _, _ = self.frame_validator.validate_frame(repaired_frame, self.frame_count)
                    
                    if is_valid_after:
                        logger.info(f"✅ Frame {self.frame_count} repaired successfully")
                        frame = repaired_frame
                    else:
                        # Use last valid frame if available
                        if self.last_valid_frame is not None:
                            logger.warning(f"Using last valid frame as fallback")
                            frame = self.last_valid_frame.copy()
                        else:
                            logger.error(f"Skipping corrupted frame {self.frame_count}, no valid fallback")
                            continue
                else:
                    # Repair failed
                    if self.last_valid_frame is not None:
                        logger.warning(f"Using last valid frame as fallback")
                        frame = self.last_valid_frame.copy()
                    else:
                        logger.error(f"Skipping corrupted frame {self.frame_count}, no valid fallback")
                        continue
            
            # Store as last valid frame
            if is_valid:
                self.last_valid_frame = frame.copy()
            
            # Check for interlacing and deinterlace if needed
            if self.frame_validator._detect_interlacing(frame):
                if self.frame_count <= 30:
                    logger.warning(f"⚠️ Frame {self.frame_count}: Interlacing detected, applying deinterlacing")
                frame = self.frame_validator.deinterlace(frame)
            
            # Enhanced debug logging for first 30 frames
            if self.frame_count <= 30:
                logger.info(f"📊 Frame {self.frame_count} Stats: mean_brightness={frame_stats.get('mean_brightness', 0):.1f}, "
                           f"std_dev={frame_stats.get('std_dev', 0):.1f}, "
                           f"resolution={frame_stats.get('width', 0)}x{frame_stats.get('height', 0)}")
                
                if frame_stats.get('mean_brightness', 0) < 15:
                    logger.warning(f"⚠️ Frame {self.frame_count} is very dark! Check camera positioning and lighting")
            
            # Save a test frame for debugging (only once at frame 30)
            if self.frame_count == 30:
                test_frame_path = os.path.join(EVIDENCE_DIR, f"debug_frame_{self.camera_id}.jpg")
                try:
                    cv2.imwrite(test_frame_path, frame)
                    logger.info(f"🖼️ Test frame saved to: {test_frame_path}")
                    logger.info(f"   ⚠️ IMPORTANT: Open this file to verify your camera is working correctly!")
                    
                    # Log validation stats
                    val_stats = self.frame_validator.get_stats()
                    logger.info(f"📊 Validation stats (first 30 frames): {val_stats}")
                    if val_stats.get('corruption_rate', 0) > 10:
                        logger.warning(f"⚠️ High frame corruption rate detected: {val_stats['corruption_rate']:.1f}%")
                        logger.warning(f"   Consider checking camera connection, cable quality, or stream settings")
                except Exception as e:
                    logger.warning(f"Failed to save test frame: {e}")

            # Process every Nth frame
            if self.frame_count % self.process_every_n == 0:
                try:
                    # Run YOLO detection with optimized confidence threshold
                    detection_start = time.time()
                    # Allow runtime override of YOLO confidence via env var `YOLO_CONF`
                    try:
                        conf_threshold = float(os.getenv("YOLO_CONF", getattr(worker_config, "YOLO_CONFIDENCE_THRESHOLD", 0.6)))
                    except Exception:
                        conf_threshold = getattr(worker_config, "YOLO_CONFIDENCE_THRESHOLD", 0.6)

                    iou_threshold = getattr(worker_config, "YOLO_IOU_THRESHOLD", 0.45)

                    detections = self.detector.predict(
                        frame,
                        conf=conf_threshold,
                        iou=iou_threshold,
                    )

                    # ✅ ENHANCED DEBUG: Log detection results with more detail
                    if len(detections) > 0:
                        try:
                            logger.info(
                                "🔍 Detections: %d objects - %s",
                                len(detections),
                                [(d.get("class_name"), round(d.get("conf", 0), 2)) for d in detections[:5]],
                            )
                        except Exception:
                            logger.info("🔍 Detections: %d objects (sample unavailable)", len(detections))
                    else:
                        # ✅ NEW: Log when NO objects are detected to help debugging
                        if self.frame_count % (30 * self.process_every_n) == 0:  # Every ~30 processed frames
                            logger.warning(
                                f"⚠️ NO OBJECTS DETECTED (Frame {self.frame_count}) | "
                                f"Confidence threshold: {conf_threshold} | "
                                f"This could mean: 1) Empty scene, 2) Dark/blank frame, 3) Model issue, 4) Camera not working"
                            )
                    detection_time = (time.time() - detection_start) * 1000

                    self.detection_count += len(detections)

                    # Run incident detection
                    incident_start = time.time()
                    incidents = self.incident_detector.analyze_frame(
                        detections, frame, self.frame_count
                    )

                    # Debug: log incidents detected by analyzer (before sending)
                    if incidents:
                        try:
                            logger.warning("Analyzer reported %d incidents: %s", len(incidents), incidents)
                        except Exception:
                            logger.warning("Analyzer reported incidents (details unavailable)")
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
            # Defensive: ensure incident has required fields
            if 'description' not in incident:
                incident['description'] = f"Incident of type {incident.get('type', 'unknown')} detected"
            if 'severity' not in incident:
                incident['severity'] = 'medium'
            if 'confidence' not in incident:
                incident['confidence'] = 0.5
            
            # Log incident
            logger.warning(
                f"🚨 {self.name} | "
                f"{incident.get('type', 'unknown').upper()} | "
                f"Severity: {incident['severity']} | "
                f"Confidence: {incident['confidence']:.2f} | "
                f"{incident['description']}"
            )

            # Save evidence snapshot
            evidence_path = self._save_evidence(incident, frame, detections)

            # Send to backend
    
            self._send_incident_to_backend(incident, evidence_path)

            
    def _save_evidence(self, incident, frame, detections):

        try:
            evidence_frame = frame.copy()

            # Draw detections safely
            for det in detections:

                bbox = det.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue

                try:
                    x1, y1, x2, y2 = [int(float(v)) for v in bbox]
                except Exception:
                    continue

                class_name = det.get("class_name", "unknown")
                conf = float(det.get("conf", 0))
                label = f"{class_name} {conf:.2f}"

                cv2.rectangle(
                    evidence_frame,
                    (x1, y1),
                    (x2, y2),
                    (0, 255, 0),
                    2,
                )

                cv2.putText(
                    evidence_frame,
                    label,
                    (x1, max(20, y1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 0),
                    2,
                )

            # Incident overlay
            inc_type = incident.get("type", "incident")
            severity = incident.get("severity", "medium")

            cv2.putText(
                evidence_frame,
                f"{inc_type} - {severity}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 0, 255),
                2,
            )

            # Save file
            timestamp = int(time.time())
            filename = f"{inc_type}_{timestamp}.jpg"
            filepath = os.path.join(self.evidence_dir, filename)

            cv2.imwrite(filepath, evidence_frame)

            try:
                with open(filepath, "rb") as f:
                    sha256 = hashlib.sha256(f.read()).hexdigest()
                logger.info(f"Evidence saved: {filepath} | SHA256: {sha256}")
            except Exception:
                logger.info(f"Evidence saved: {filepath}")

            return f"camera_{self.camera_id}/{filename}"

        except Exception as e:
            logger.error(f"_save_evidence failed: {e}")
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

            # Create incident payload (with defensive checks)
            incident_payload = {
                "camera_id": self.camera_id,
                "type": incident_type,
                "severity": incident.get("severity", "medium"),
                "severity_score": float(incident.get("confidence", 0.5) * 100),
                "description": incident.get("description", f"Incident of type {incident_type} detected"),
            }

            # Send incident
            # Retry logic for backend posts (make worker resilient to transient timeouts)
            max_retries = 3
            for attempt in range(1, max_retries + 1):
                try:
                    response = requests.post(
                        f"{BACKEND_URL}/api/v1/incidents/",
                        json=incident_payload,
                        timeout=30,
                        headers=_build_headers(),
                    )

                    if response.status_code in [200, 201]:
                        incident_data = response.json()
                        incident_id = incident_data["id"]

                        logger.info(f"✅ Incident sent to backend (ID: {incident_id})")

                        # Send evidence if saved
                        if evidence_path:
                            self._send_evidence_to_backend(incident_id, evidence_path)
                        break
                    else:
                        logger.error(f"Failed to send incident (status {response.status_code}): {response.text}")
                        # If server returned a client error, don't retry
                        if 400 <= response.status_code < 500:
                            break

                except requests.exceptions.Timeout as e:
                    logger.error(f"Timeout sending incident to backend (attempt {attempt}): {e}")
                    if attempt == max_retries:
                        logger.error("Giving up sending incident after retries")
                except Exception as e:
                    logger.error(f"Failed to send incident to backend (attempt {attempt}): {e}")
                    if attempt == max_retries:
                        logger.error("Giving up sending incident after retries")
                # small backoff between retries
                time.sleep(0.5 * attempt)

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
                "extra_metadata": {
                    "camera_id": self.camera_id,
                    "frame_number": self.frame_count,
                },
            }
            
            # Debug: Log exactly what we're sending
            logger.info(f"📤 Sending evidence payload: {json.dumps(evidence_payload, indent=2)}")

            # Post evidence metadata with retries
            max_retries = 3
            for attempt in range(1, max_retries + 1):
                try:
                    response = requests.post(
                        f"{BACKEND_URL}/api/v1/evidence/",
                        json=evidence_payload,
                        timeout=30,
                        headers=_build_headers(),
                    )

                    if response.status_code in [200, 201]:
                        logger.info("✅ Evidence sent to backend")
                        break
                    else:
                        logger.error(f"Failed to send evidence (status {response.status_code}): {response.text}")
                        if 400 <= response.status_code < 500:
                            break

                except requests.exceptions.Timeout as e:
                    logger.error(f"Timeout sending evidence to backend (attempt {attempt}): {e}")
                    if attempt == max_retries:
                        logger.error("Giving up sending evidence after retries")
                except Exception as e:
                    logger.error(f"Failed to send evidence to backend (attempt {attempt}): {e}")
                    if attempt == max_retries:
                        logger.error("Giving up sending evidence after retries")

                time.sleep(0.5 * attempt)

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
        """
        Update camera status in backend database.

        Assumes a backend route:
        PATCH /api/v1/cameras/{camera_id}/status

        Body:
        {
          "worker_status": "starting|running|stopped|error",
          "is_online": bool,
          "last_heartbeat": datetime,
          "error_message": str | null,
          "fps": float,
          "total_frames": int,
          "total_incidents": int,
          "processing_device": "cuda:0|cpu"
        }
        """
        try:
            # Map worker fields to backend `CameraStatusUpdate` schema keys
            payload = {
                # Backend expects `status` (not `worker_status`)
                "status": status,
                "error_message": error_msg,
                "fps": float(fps if fps is not None else (self.fps_list[-1] if self.fps_list else 0.0)),
                "total_frames": int(total_frames if total_frames is not None else self.frame_count),
                "total_incidents": int(total_incidents if total_incidents is not None else self.incident_count),
                "processing_device": self.device,
            }

            response = requests.patch(
                f"{BACKEND_URL}/api/v1/cameras/{self.camera_id}/status",
                json=payload,
                timeout=30,
                headers=_build_headers(),
            )

            if response.status_code != 200:
                logger.warning(
                    "Failed to update backend status: %s - %s",
                    response.status_code,
                    response.text,
                )

        except Exception as e:
            logger.warning(f"Failed to update backend status: {e}")


    def _cleanup(self):
        """Cleanup resources"""
        logger.info(f"🧹 Cleaning up {self.name}...")
        
        # Log final validation statistics
        val_stats = self.frame_validator.get_stats()
        logger.info(f"📊 Final validation statistics:")
        logger.info(f"   Total frames checked: {val_stats.get('total_frames_checked', 0)}")
        logger.info(f"   Corrupted frames: {val_stats.get('corrupted_frames', 0)}")
        logger.info(f"   Corruption rate: {val_stats.get('corruption_rate', 0):.2f}%")
        
        if val_stats.get('corruption_rate', 0) > 5:
            logger.warning(f"⚠️ High corruption rate detected! Consider:")
            logger.warning(f"   1. Checking camera cable connections")
            logger.warning(f"   2. Reducing stream resolution")
            logger.warning(f"   3. Using a different video backend (CAP_DSHOW vs CAP_MSMF)")
            logger.warning(f"   4. Checking for electromagnetic interference")
        
        # Proper cleanup: release stream and any resources
        try:
            if self.cap:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None
        except Exception:
            pass

    def _reconnect(self):
        """Attempt to reconnect the stream (used during processing)."""
        logger.info("🔄 Attempting reconnection...")

        # Close existing stream
        try:
            if self.cap:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None
        except Exception:
            pass

        time.sleep(1.0)  # small backoff before reconnect

        try:
            # Re-create UnifiedStreamReader the same way as in run()
            self.cap = UnifiedStreamReader(self.stream_url)
            opened = False
            try:
                opened = self.cap.open()
            except Exception:
                opened = False

            try:
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
            except Exception:
                pass

            if opened and self.cap.isOpened():
                logger.info("✅ Reconnected")
                # tell backend we are running again
                try:
                    self._update_backend_status(
                        "running",
                        total_frames=self.frame_count,
                        total_incidents=self.incident_count,
                    )
                except Exception:
                    pass
            else:
                logger.error("❌ Reconnection failed (stream not opened)")
                try:
                    self._update_backend_status("error", error_msg="Stream reconnect failed")
                except Exception:
                    pass

        except Exception as e:
            logger.error(f"❌ Reconnection exception: {e}")
            try:
                self._update_backend_status("error", error_msg="Stream reconnect exception")
            except Exception:
                pass



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
