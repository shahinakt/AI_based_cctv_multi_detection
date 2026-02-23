"""
ai_worker/inference/single_camera_worker.py - FIXED VERSION

BUGS FIXED:
1. SmartFallDetector and SmartTheftDetector were created in __init__ but NEVER called
   in _processing_loop. Incidents from these detectors were silently discarded.
   Fix: call self.fall_detector.analyze_fall() and self.theft_detector.analyze_theft()
   inside the processing loop and merge their results.

2. YOLO confidence threshold fallback was 0.6 (hard-coded) instead of reading
   from config.YOLO_CONFIDENCE_THRESHOLD (0.25). Fix: explicit attribute read.
"""

import cv2
import time
import logging
import os
import hashlib
import json
from datetime import datetime
import requests
from typing import List, Dict, Optional

from ai_worker.inference.websocket_stream_worker import UnifiedStreamReader
from ai_worker import config as worker_config
from ai_worker.inference.fall_detector import SmartFallDetector
from ai_worker.inference.theft_detector import SmartTheftDetector
from ai_worker.models.yolo_detector import YOLODetector
from pathlib import Path
from ai_worker.inference.incident_detector import IncidentDetector
from ai_worker.utils.frame_validator import FrameValidator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", getattr(worker_config, "BACKEND_URL", "http://localhost:8000"))
EVIDENCE_DIR = os.getenv("EVIDENCE_DIR", getattr(worker_config, "EVIDENCE_DIR", "data/captures"))
BACKEND_API_KEY = getattr(worker_config, "BACKEND_API_KEY", os.getenv("BACKEND_API_KEY", ""))


def _build_headers():
    if BACKEND_API_KEY:
        return {"Authorization": f"Bearer {BACKEND_API_KEY}"}
    return {}


class SingleCameraWorker:
    def __init__(self, camera_id: int, config: dict):
        self.camera_id = camera_id
        self.config = config
        self.device = config.get("device", "cpu")
        self.stream_url = config["stream_url"]
        self.resolution = config.get("resolution", (640, 480))
        self.process_every_n = config.get("process_every_n_frames", 1)
        self.name = config.get("name", f"Camera_{camera_id}")

        self.frame_count = 0
        self.detection_count = 0
        self.incident_count = 0
        self.fps_list: List[float] = []
        self.start_time = time.time()

        self.detector: Optional[YOLODetector] = None
        self.incident_detector: Optional[IncidentDetector] = None
        self.cap = None

        self.frame_validator = FrameValidator()
        self.last_valid_frame: Optional[object] = None
        self.corrupted_frame_count = 0

        self.evidence_dir = os.path.join(EVIDENCE_DIR, f"camera_{camera_id}")
        os.makedirs(self.evidence_dir, exist_ok=True)

        # Smart detectors – will be called explicitly in _processing_loop (BUG FIX)
        self.fall_detector = SmartFallDetector(f"camera_{camera_id}")
        self.theft_detector = SmartTheftDetector(f"camera_{camera_id}")

    # ──────────────────────────────────────────────────────────────────────────
    # run()
    # ──────────────────────────────────────────────────────────────────────────
    def run(self):
        logger.info(f"🚀 Starting {self.name} (ID: {self.camera_id})")
        logger.info(f"   Device: {self.device}")
        logger.info(f"   Stream: {self.stream_url}")
        logger.info(f"   Backend: {BACKEND_URL}")
        logger.info(f"   Resolution: {self.resolution}")

        self._update_backend_status("starting")

        # Load YOLO
        try:
            logger.info(f"Loading YOLO on {self.device}...")
            model_env = os.getenv("YOLO_MODEL_PATH")
            if model_env and Path(model_env).exists():
                model_path = model_env
            else:
                pkg_root = Path(__file__).resolve().parents[2]
                candidate1 = pkg_root / "yolov8n.pt"
                candidate2 = Path(__file__).resolve().parents[3] / "yolov8n.pt"
                if candidate1.exists():
                    model_path = str(candidate1)
                elif candidate2.exists():
                    model_path = str(candidate2)
                else:
                    model_path = "yolov8n.pt"

            logger.info(f"Using YOLO model path: {model_path}")
            self.detector = YOLODetector(model_path, device=self.device)
            logger.info("✅ Detector loaded")
        except Exception as e:
            logger.error(f"❌ Failed to load detector: {e}")
            self._update_backend_status("error", error_msg=str(e))
            return

        # Load IncidentDetector
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

        # Open stream
        try:
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

            if not opened or not self.cap.isOpened():
                raise Exception("Cannot open stream")

            logger.info("✅ Stream opened")
        except Exception as e:
            logger.error(f"❌ Failed to open stream: {e}")
            self._update_backend_status("error", error_msg=str(e))
            return

        self._update_backend_status("running")
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

    # ──────────────────────────────────────────────────────────────────────────
    # _processing_loop  ← MAIN FIX IS HERE
    # ──────────────────────────────────────────────────────────────────────────
    def _processing_loop(self):
        detections: List[Dict] = []

        while True:
            if not self.cap or not self.cap.isOpened():
                logger.warning("⚠️ Stream not opened, attempting reconnect...")
                self._reconnect()
                time.sleep(0.5)
                continue

            loop_start = time.time()

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

            # ── Frame validation ──────────────────────────────────────────────
            is_valid, validation_message, frame_stats = self.frame_validator.validate_frame(
                frame, self.frame_count
            )

            if not is_valid:
                logger.warning(f"Frame {self.frame_count} validation failed: {validation_message}")
                self.corrupted_frame_count += 1
                repaired_frame = self.frame_validator.repair_frame(frame, self.last_valid_frame)
                if repaired_frame is not None:
                    is_valid_after, _, _ = self.frame_validator.validate_frame(
                        repaired_frame, self.frame_count
                    )
                    if is_valid_after:
                        frame = repaired_frame
                    elif self.last_valid_frame is not None:
                        frame = self.last_valid_frame.copy()
                    else:
                        continue
                elif self.last_valid_frame is not None:
                    frame = self.last_valid_frame.copy()
                else:
                    continue

            if is_valid:
                self.last_valid_frame = frame.copy()

            if self.frame_validator._detect_interlacing(frame):
                frame = self.frame_validator.deinterlace(frame)

            # Debug logging for first 30 frames
            if self.frame_count <= 30:
                logger.info(
                    f"📊 Frame {self.frame_count} Stats: "
                    f"mean_brightness={frame_stats.get('mean_brightness', 0):.1f}, "
                    f"std_dev={frame_stats.get('std_dev', 0):.1f}, "
                    f"resolution={frame_stats.get('width', 0)}x{frame_stats.get('height', 0)}"
                )

            # Save debug frame at frame 30
            if self.frame_count == 30:
                test_frame_path = os.path.join(EVIDENCE_DIR, f"debug_frame_{self.camera_id}.jpg")
                try:
                    cv2.imwrite(test_frame_path, frame)
                    logger.info(f"🖼️ Test frame saved to: {test_frame_path}")
                    val_stats = self.frame_validator.get_stats()
                    logger.info(f"📊 Validation stats (first 30 frames): {val_stats}")
                except Exception as e:
                    logger.warning(f"Failed to save test frame: {e}")

            # ── Process every Nth frame ───────────────────────────────────────
            if self.frame_count % self.process_every_n == 0:
                try:
                    # ── YOLO detection ────────────────────────────────────────
                    # FIX: use config attribute directly; avoid the hard-coded 0.6 fallback
                    try:
                        conf_threshold = float(
                            os.getenv(
                                "YOLO_CONF",
                                str(getattr(worker_config, "YOLO_CONFIDENCE_THRESHOLD", 0.25)),
                            )
                        )
                    except Exception:
                        conf_threshold = 0.25   # safe default (was incorrectly 0.6)

                    iou_threshold = getattr(worker_config, "YOLO_IOU_THRESHOLD", 0.45)

                    detection_start = time.time()
                    detections = self.detector.predict(
                        frame,
                        conf=conf_threshold,
                        iou=iou_threshold,
                    )
                    detection_time = (time.time() - detection_start) * 1000

                    if detections:
                        logger.info(
                            "🔍 Detections: %d objects - %s",
                            len(detections),
                            [(d.get("class_name"), round(d.get("conf", 0), 2)) for d in detections[:5]],
                        )
                    else:
                        if self.frame_count % (30 * self.process_every_n) == 0:
                            logger.warning(
                                f"⚠️ NO OBJECTS DETECTED (Frame {self.frame_count}) | "
                                f"conf={conf_threshold}"
                            )

                    self.detection_count += len(detections)
                    current_time = time.time()

                    # ── IncidentDetector (pose-based: fall, attack, intrusion, violence) ──
                    incident_start = time.time()
                    incidents = self.incident_detector.analyze_frame(
                        detections, frame, self.frame_count
                    )

                    # ── FIX: call SmartFallDetector (bbox-based, no pose required) ────────
                    try:
                        fall_incidents = self.fall_detector.analyze_fall(
                            detections, frame, self.frame_count, current_time
                        )
                        if fall_incidents:
                            logger.warning(
                                "🚨 SmartFallDetector fired %d incident(s): %s",
                                len(fall_incidents),
                                [i.get("type") for i in fall_incidents],
                            )
                        incidents.extend(fall_incidents)
                    except Exception as e:
                        logger.error(f"SmartFallDetector error: {e}")

                    # ── FIX: call SmartTheftDetector ─────────────────────────────────────
                    try:
                        theft_incidents = self.theft_detector.analyze_theft(
                            detections, frame, self.frame_count, current_time
                        )
                        if theft_incidents:
                            logger.warning(
                                "🚨 SmartTheftDetector fired %d incident(s): %s",
                                len(theft_incidents),
                                [i.get("type") for i in theft_incidents],
                            )
                        incidents.extend(theft_incidents)
                    except Exception as e:
                        logger.error(f"SmartTheftDetector error: {e}")

                    incident_time = (time.time() - incident_start) * 1000  # noqa: F841

                    if incidents:
                        logger.warning(
                            "Analyzer reported %d total incidents: %s",
                            len(incidents),
                            [i.get("type") for i in incidents],
                        )
                        self.incident_count += len(incidents)
                        self._handle_incidents(incidents, frame, detections)

                    # ── FPS and status update ─────────────────────────────────
                    loop_time = time.time() - loop_start
                    fps = 1 / loop_time if loop_time > 0 else 0
                    self.fps_list.append(fps)

                    if (self.frame_count // self.process_every_n) % 30 == 0:
                        last_n = min(len(self.fps_list), 30)
                        avg_fps = sum(self.fps_list[-last_n:]) / last_n if last_n > 0 else 0.0
                        self._update_backend_status(
                            "running",
                            fps=avg_fps,
                            total_frames=self.frame_count,
                            total_incidents=self.incident_count,
                        )
                        logger.info(
                            f"{self.name} | Frame: {self.frame_count} | FPS: {avg_fps:.1f} | "
                            f"Detect: {detection_time:.0f}ms | Objects: {len(detections)} | "
                            f"Incidents: {self.incident_count}"
                        )

                except Exception as e:
                    logger.error(f"❌ Processing error on frame {self.frame_count}: {e}")
                    continue

    # ──────────────────────────────────────────────────────────────────────────
    # Incident handling
    # ──────────────────────────────────────────────────────────────────────────
    def _handle_incidents(self, incidents: List[Dict], frame, detections: List[Dict]):
        for incident in incidents:
            if "description" not in incident:
                incident["description"] = f"Incident of type {incident.get('type', 'unknown')} detected"
            if "severity" not in incident:
                incident["severity"] = "medium"
            if "confidence" not in incident:
                incident["confidence"] = 0.5

            logger.warning(
                f"🚨 {self.name} | {incident.get('type', 'unknown').upper()} | "
                f"Severity: {incident['severity']} | Confidence: {incident['confidence']:.2f} | "
                f"{incident['description']}"
            )

            evidence_path = self._save_evidence(incident, frame, detections)
            self._send_incident_to_backend(incident, evidence_path)

    def _save_evidence(self, incident, frame, detections):
        try:
            evidence_frame = frame.copy()

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
                cv2.rectangle(evidence_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(
                    evidence_frame, f"{class_name} {conf:.2f}",
                    (x1, max(20, y1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2,
                )

            inc_type = incident.get("type", "incident")
            severity = incident.get("severity", "medium")
            cv2.putText(
                evidence_frame, f"{inc_type} - {severity}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2,
            )

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
        try:
            type_mapping = {
                "fall_detected": "fall_health",
                "potential_violence": "abuse_violence",
                "potential_theft": "theft",
                "theft_detected": "theft",
                "slap_detected": "abuse_violence",
                "strike_detected": "abuse_violence",
                "fight_detected": "abuse_violence",
                "violence_detected": "abuse_violence",
                "intrusion_detected": "abuse_violence",
                "line_crossing": "abuse_violence",
                "intrusion": "abuse_violence",
                "loitering": "theft",
                "health_emergency": "fall_health",
            }

            incident_type = type_mapping.get(incident["type"], "abuse_violence")

            incident_payload = {
                "camera_id": self.camera_id,
                "type": incident_type,
                "severity": incident.get("severity", "medium"),
                "severity_score": float(incident.get("confidence", 0.5) * 100),
                "description": incident.get("description", f"Incident of type {incident_type} detected"),
            }

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
                        incident_id = response.json()["id"]
                        logger.info(f"✅ Incident sent to backend (ID: {incident_id})")
                        if evidence_path:
                            self._send_evidence_to_backend(incident_id, evidence_path)
                        break
                    else:
                        logger.error(
                            f"Failed to send incident (status {response.status_code}): {response.text}"
                        )
                        if 400 <= response.status_code < 500:
                            break
                except requests.exceptions.Timeout as e:
                    logger.error(f"Timeout sending incident (attempt {attempt}): {e}")
                    if attempt == max_retries:
                        logger.error("Giving up sending incident after retries")
                except Exception as e:
                    logger.error(f"Failed to send incident (attempt {attempt}): {e}")
                    if attempt == max_retries:
                        logger.error("Giving up sending incident after retries")
                time.sleep(0.5 * attempt)

        except Exception as e:
            logger.error(f"Failed to send incident to backend: {e}")

    def _send_evidence_to_backend(self, incident_id: int, evidence_path: str):
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

            logger.info(f"📤 Sending evidence payload: {json.dumps(evidence_payload, indent=2)}")

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
                        logger.error(
                            f"Failed to send evidence (status {response.status_code}): {response.text}"
                        )
                        if 400 <= response.status_code < 500:
                            break
                except requests.exceptions.Timeout as e:
                    logger.error(f"Timeout sending evidence (attempt {attempt}): {e}")
                    if attempt == max_retries:
                        logger.error("Giving up sending evidence after retries")
                except Exception as e:
                    logger.error(f"Failed to send evidence (attempt {attempt}): {e}")
                    if attempt == max_retries:
                        logger.error("Giving up sending evidence after retries")
                time.sleep(0.5 * attempt)

        except Exception as e:
            logger.error(f"Failed to send evidence: {e}")

    def _update_backend_status(
        self,
        status: str,
        error_msg: Optional[str] = None,
        fps: Optional[float] = None,
        total_frames: Optional[int] = None,
        total_incidents: Optional[int] = None,
    ):
        try:
            payload = {
                "status": status,
                "error_message": error_msg,
                "fps": float(fps if fps is not None else (self.fps_list[-1] if self.fps_list else 0.0)),
                "total_frames": int(total_frames if total_frames is not None else self.frame_count),
                "total_incidents": int(
                    total_incidents if total_incidents is not None else self.incident_count
                ),
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
        logger.info(f"🧹 Cleaning up {self.name}...")
        val_stats = self.frame_validator.get_stats()
        logger.info(f"📊 Final validation statistics: {val_stats}")
        if val_stats.get("corruption_rate", 0) > 5:
            logger.warning("⚠️ High corruption rate detected!")
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
        logger.info("🔄 Attempting reconnection...")
        try:
            if self.cap:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None
        except Exception:
            pass

        time.sleep(1.0)

        try:
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
                try:
                    self._update_backend_status(
                        "running",
                        total_frames=self.frame_count,
                        total_incidents=self.incident_count,
                    )
                except Exception:
                    pass
            else:
                logger.error("❌ Reconnection failed")
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
    try:
        worker = SingleCameraWorker(camera_id, config)
        worker.run()
    except Exception as e:
        logger.error(f"Camera process {camera_id} crashed: {e}")