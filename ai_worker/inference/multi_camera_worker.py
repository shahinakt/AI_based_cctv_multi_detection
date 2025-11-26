import multiprocessing as mp
import cv2
import time
import logging
import sys
import os

from ai_worker.config import CAMERAS   # ← ADD THIS LINE
from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.inference.incident_detector import IncidentDetector


logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


class SingleCameraWorker:
    """
    Worker for processing a single camera stream
    Optimized for MX350 GPU (2GB VRAM) with CPU fallback
    """
    
    def __init__(self, camera_id: str, config: dict):
        """
        Initialize camera worker
        
        Args:
            camera_id: Unique camera identifier
            config: Camera configuration dict from config.py
        """
        self.camera_id = camera_id
        self.config = config
        self.device = config['device']
        self.stream_url = config['stream_url']
        self.resolution = config['resolution']
        self.process_every_n = config.get('process_every_n_frames', 1)
        self.model_size = config.get('model_size', 'yolov8n.pt')
        
        # Performance tracking
        self.frame_count = 0
        self.detection_count = 0
        self.incident_count = 0
        self.fps_list = []
        
        # Components (initialized in run())
        self.detector = None
        self.incident_detector = None
        self.cap = None
    
    def run(self):
        """Main processing loop for this camera"""
        logger.info(f"🚀 Starting {self.camera_id}")
        logger.info(f"   Device: {self.device}")
        logger.info(f"   Resolution: {self.resolution}")
        logger.info(f"   Process every: {self.process_every_n} frames")
        
        # Initialize YOLO detector
        try:
            logger.info(f"Loading YOLO model on {self.device}...")
            self.detector = YOLODetector(self.model_size, device=self.device)
            logger.info(f"✅ {self.camera_id}: Detector loaded successfully")
        except Exception as e:
            logger.error(f"❌ {self.camera_id}: Failed to load detector: {e}")
            return
        
        # Initialize incident detector
        try:
            self.incident_detector = IncidentDetector(self.camera_id)
            logger.info(f"✅ {self.camera_id}: Incident detector initialized")
        except Exception as e:
            logger.error(f"❌ {self.camera_id}: Failed to load incident detector: {e}")
            return
        
        # Open video stream
        try:
            self.cap = cv2.VideoCapture(self.stream_url)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
            
            if not self.cap.isOpened():
                raise Exception(f"Cannot open stream {self.stream_url}")
            
            logger.info(f"✅ {self.camera_id}: Stream opened")
            
        except Exception as e:
            logger.error(f"❌ {self.camera_id}: Failed to open stream: {e}")
            return
        
        # Start processing loop
        logger.info(f"🎬 {self.camera_id}: Processing started...")
        
        try:
            self._processing_loop()
        except KeyboardInterrupt:
            logger.info(f"⚠️ {self.camera_id}: Interrupted by user")
        except Exception as e:
            logger.error(f"❌ {self.camera_id}: Processing error: {e}")
        finally:
            self._cleanup()
    
    def _processing_loop(self):
        """Main frame processing loop"""
        detections = []
        while True:
            loop_start = time.time()
            
            # Read frame
            ret, frame = self.cap.read()
            if not ret:
                logger.warning(f"⚠️ {self.camera_id}: Failed to read frame, reconnecting...")
                time.sleep(1)
                self._reconnect()
                continue
            
            self.frame_count += 1
            
            # Process only every Nth frame
            if self.frame_count % self.process_every_n == 0:
                try:
                    # Run YOLO detection
                    detection_start = time.time()
                    detections = self.detector.predict(frame, conf=0.25)
                    detection_time = (time.time() - detection_start) * 1000
                    
                    self.detection_count += len(detections)
                    
                    # Run incident detection
                    incident_start = time.time()
                    incidents = self.incident_detector.analyze_frame(
                        detections, frame, self.frame_count
                    )
                    incident_time = (time.time() - incident_start) * 1000
                    
                    # Handle incidents
                    if incidents:
                        self.incident_count += len(incidents)
                        self._handle_incidents(incidents, frame)
                    
                    # Calculate FPS
                    loop_time = time.time() - loop_start
                    fps = 1 / loop_time if loop_time > 0 else 0
                    self.fps_list.append(fps)
                    
                    # Log every 30 processed frames
                    if (self.frame_count // self.process_every_n) % 30 == 0:
                        avg_fps = sum(self.fps_list[-30:]) / min(len(self.fps_list), 30)
                        
                        logger.info(
                            f"{self.camera_id} | "
                            f"Frame: {self.frame_count} | "
                            f"FPS: {avg_fps:.1f} | "
                            f"Detect: {detection_time:.0f}ms | "
                            f"Objects: {len(detections)} | "
                            f"Incidents: {self.incident_count} | "
                            f"Device: {self.device}"
                        )
                        
                        # Show GPU memory if using GPU
                        if self.device.startswith('cuda'):
                            mem_info = self.detector.get_memory_usage()
                            logger.info(
                                f"{self.camera_id} GPU Memory: "
                                f"{mem_info['allocated_mb']:.0f}MB allocated, "
                                f"{mem_info['cached_mb']:.0f}MB cached"
                            )
                
                except Exception as e:
                    logger.error(f"❌ {self.camera_id}: Processing error: {e}")
                    # Continue processing even if one frame fails
                    continue
            
            self._display_frame(frame, detections) 
            # self._display_frame(frame, detections if 'detections' in locals() else [])
    
    def _handle_incidents(self, incidents: list, frame):
        """Handle detected incidents"""
        for incident in incidents:
            # Log incident
            logger.warning(
                f"🚨 {self.camera_id} | "
                f"{incident['type'].upper()} | "
                f"Severity: {incident['severity']} | "
                f"Confidence: {incident['confidence']:.2f} | "
                f"{incident['description']}"
            )
            
            # Send to backend (if available)
            self._send_to_backend(incident, frame)
            
            # Save evidence locally
            self._save_evidence(incident, frame)
    
    def _send_to_backend(self, incident: dict, frame):
        """Send incident to backend API"""
        try:
            import requests
            
            # Encode frame
            _, img_encoded = cv2.imencode('.jpg', frame)
            
            # Prepare payload
            payload = {
                'camera_id': self.camera_id,
                'incident_type': incident['type'],
                'severity': incident['severity'],
                'confidence': float(incident['confidence']),
                'description': incident['description'],
                'timestamp': incident['timestamp'],
                'frame_number': self.frame_count
            }
            
            # Uncomment when backend is ready:
            # response = requests.post(
            #     f"{BACKEND_URL}/api/incidents",
            #     json=payload,
            #     files={'image': img_encoded.tobytes()},
            #     timeout=5
            # )
            # if response.status_code == 200:
            #     logger.info(f"✅ Incident sent to backend")
            
        except Exception as e:
            logger.error(f"Failed to send to backend: {e}")
    
    def _save_evidence(self, incident: dict, frame):
        """Save incident evidence locally"""
        try:
            # Create evidence directory
            evidence_dir = f"evidence/{self.camera_id}"
            os.makedirs(evidence_dir, exist_ok=True)
            
            # Save snapshot
            timestamp = int(incident['timestamp'])
            filename = f"{evidence_dir}/{incident['type']}_{timestamp}.jpg"
            cv2.imwrite(filename, frame)
            
            logger.info(f"💾 Evidence saved: {filename}")
            
        except Exception as e:
            logger.error(f"Failed to save evidence: {e}")
    
    def _display_frame(self, frame, detections):
        """Display frame with detections (for debugging/monitoring)"""
        import cv2

        display_frame = frame.copy()

        # Draw detections if available
        if detections:
            for det in detections:
                bbox = [int(x) for x in det['bbox']]
                label = f"{det['class_name']} {det['conf']:.2f}"

                cv2.rectangle(display_frame,
                              (bbox[0], bbox[1]),
                              (bbox[2], bbox[3]),
                              (0, 255, 0),
                              2)
                cv2.putText(display_frame,
                            label,
                            (bbox[0], bbox[1] - 10),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.5,
                            (0, 255, 0),
                            2)

        cv2.imshow(f"{self.camera_id}", display_frame)

        # Press 'q' to close this camera window
        if cv2.waitKey(1) & 0xFF == ord('q'):
            raise KeyboardInterrupt()

    
    def _reconnect(self):
        """Attempt to reconnect to stream"""
        logger.info(f"🔄 {self.camera_id}: Attempting reconnection...")
        
        if self.cap:
            self.cap.release()
        
        self.cap = cv2.VideoCapture(self.stream_url)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
        
        if self.cap.isOpened():
            logger.info(f"✅ {self.camera_id}: Reconnected")
        else:
            logger.error(f"❌ {self.camera_id}: Reconnection failed")
    
    def _cleanup(self):
        """Cleanup resources"""
        logger.info(f"🧹 {self.camera_id}: Cleaning up...")
        
        if self.cap:
            self.cap.release()
        
        cv2.destroyAllWindows()
        
        # Print final stats
        if self.frame_count > 0:
            avg_fps = sum(self.fps_list) / len(self.fps_list) if self.fps_list else 0
            logger.info(
                f"📊 {self.camera_id} Final Stats:\n"
                f"   Frames processed: {self.frame_count}\n"
                f"   Average FPS: {avg_fps:.1f}\n"
                f"   Total detections: {self.detection_count}\n"
                f"   Total incidents: {self.incident_count}"
            )


def start_camera_process(camera_id: str, config: dict):
    """Start a single camera worker in a separate process"""
    try:
        worker = SingleCameraWorker(camera_id, config)
        worker.run()
    except Exception as e:
        logger.error(f"Camera process {camera_id} crashed: {e}")


def start_all_cameras():
    """Start all cameras defined in config.py"""
    logger.info("=" * 70)
    logger.info("🎥 AI-POWERED MULTI-CAMERA SURVEILLANCE SYSTEM")
    logger.info("=" * 70)
    
    processes = []
    
    for camera_id, config in CAMERAS.items():
        logger.info(f"\n📹 Launching {camera_id}:")
        logger.info(f"   Device: {config['device']}")
        logger.info(f"   Resolution: {config['resolution']}")
        logger.info(f"   Priority: {config['priority']}")
        
        # Create separate process for each camera
        process = mp.Process(
            target=start_camera_process,
            args=(camera_id, config),
            name=camera_id
        )
        process.start()
        processes.append((camera_id, process))
        
        # Stagger startup to avoid GPU/CPU spike
        time.sleep(2)
    
    logger.info("\n" + "=" * 70)
    logger.info(f"✅ All {len(processes)} cameras started successfully")
    logger.info("Press Ctrl+C to stop all cameras")
    logger.info("=" * 70 + "\n")
    
    # Wait for all processes
    try:
        for camera_id, process in processes:
            process.join()
    except KeyboardInterrupt:
        logger.info("\n\n⚠️ Stopping all cameras...")
        for camera_id, process in processes:
            logger.info(f"   Stopping {camera_id}...")
            process.terminate()
            process.join(timeout=5)
            if process.is_alive():
                process.kill()
        logger.info("✅ All cameras stopped")


if __name__ == '__main__':
    # Set multiprocessing start method (important for CUDA)
    mp.set_start_method('spawn', force=True)
    
    # Start all cameras
    start_all_cameras()