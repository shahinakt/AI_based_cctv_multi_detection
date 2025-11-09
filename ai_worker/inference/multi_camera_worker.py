# ai_worker/inference/multi_camera_worker.py
import multiprocessing as mp
import cv2
import time
import logging
from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.config import CAMERAS, BACKEND_URL
import requests
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SingleCameraWorker:
    """Worker for a single camera stream"""
    
    def __init__(self, camera_id, config):
        self.camera_id = camera_id
        self.config = config
        self.device = config['device']
        self.stream_url = config['stream_url']
        self.resolution = config['resolution']
        self.process_every_n = config.get('process_every_n_frames', 1)
        
        # Performance tracking
        self.frame_count = 0
        self.detection_count = 0
        self.fps_list = []
        
    def run(self):
        """Main processing loop for this camera"""
        logger.info(f"Starting {self.camera_id} on device: {self.device}")
        
        # Load detector
        try:
            detector = YOLODetector('yolov8n.pt', device=self.device)
            logger.info(f"✅ {self.camera_id}: Detector loaded on {self.device}")
        except Exception as e:
            logger.error(f"❌ {self.camera_id}: Failed to load detector: {e}")
            return
        
        # Open stream
        cap = cv2.VideoCapture(self.stream_url)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
        
        if not cap.isOpened():
            logger.error(f"❌ {self.camera_id}: Cannot open stream {self.stream_url}")
            return
        
        logger.info(f"✅ {self.camera_id}: Stream opened")
        
        # Processing loop
        while True:
            start_time = time.time()
            
            ret, frame = cap.read()
            if not ret:
                logger.warning(f"⚠️ {self.camera_id}: Failed to read frame")
                time.sleep(1)
                continue
            
            self.frame_count += 1
            
            # Process only every Nth frame
            if self.frame_count % self.process_every_n == 0:
                try:
                    # Run detection
                    detections = detector.predict(frame, conf=0.5)
                    self.detection_count += len(detections)
                    
                    # Check for incidents
                    incidents = self.detect_incidents(detections, frame)
                    
                    # Send to backend if incident detected
                    if incidents:
                        self.send_to_backend(incidents, frame)
                    
                    # Calculate FPS
                    fps = 1 / (time.time() - start_time)
                    self.fps_list.append(fps)
                    
                    # Log every 30 frames
                    if self.frame_count % 30 == 0:
                        avg_fps = sum(self.fps_list[-30:]) / len(self.fps_list[-30:])
                        logger.info(
                            f"{self.camera_id}: Frame {self.frame_count} | "
                            f"FPS: {avg_fps:.1f} | "
                            f"Detections: {len(detections)} | "
                            f"Device: {self.device}"
                        )
                
                except Exception as e:
                    logger.error(f"❌ {self.camera_id}: Detection error: {e}")
            
            # Optional: Display frame (comment out for headless)
            # cv2.imshow(self.camera_id, frame)
            # if cv2.waitKey(1) & 0xFF == ord('q'):
            #     break
        
        cap.release()
        cv2.destroyAllWindows()
    
    def detect_incidents(self, detections, frame):
        """
        Detect incidents from detections
        
        Types of incidents:
        1. Intrusion: Person detected in restricted area
        2. Theft: Person + valuable object (bag, laptop) + rapid movement
        3. Fall: Person bounding box aspect ratio changes dramatically
        4. Fight: Multiple people in close proximity + high motion
        5. Loitering: Person stationary for long time
        """
        incidents = []
        
        # Extract person detections
        persons = [d for d in detections if d['class_name'] == 'person']
        
        # 1. Multiple people (potential fight/crowding)
        if len(persons) >= 3:
            incidents.append({
                'type': 'crowding',
                'confidence': 0.7,
                'description': f'{len(persons)} people detected',
                'camera_id': self.camera_id
            })
        
        # 2. Valuable objects detected (potential theft)
        valuable_objects = ['backpack', 'handbag', 'suitcase', 'laptop', 'cell phone']
        stolen_items = [d for d in detections if d['class_name'] in valuable_objects]
        
        if len(persons) > 0 and len(stolen_items) > 0:
            incidents.append({
                'type': 'potential_theft',
                'confidence': 0.6,
                'description': f'Person near {stolen_items[0]["class_name"]}',
                'camera_id': self.camera_id
            })
        
        # 3. Person with unusual bounding box (potential fall)
        for person in persons:
            bbox = person['bbox']
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            aspect_ratio = height / width if width > 0 else 0
            
            # Normal standing person: height > width (aspect > 1)
            # Fallen person: width > height (aspect < 1)
            if aspect_ratio < 0.8:  # Horizontal orientation
                incidents.append({
                    'type': 'fall_detected',
                    'confidence': person['conf'],
                    'description': 'Person in horizontal position',
                    'camera_id': self.camera_id,
                    'bbox': bbox
                })
        
        return incidents
    
    def send_to_backend(self, incidents, frame):
        """Send incident to backend API"""
        for incident in incidents:
            try:
                # Prepare data
                _, img_encoded = cv2.imencode('.jpg', frame)
                
                payload = {
                    'camera_id': self.camera_id,
                    'incident_type': incident['type'],
                    'confidence': incident['confidence'],
                    'description': incident['description'],
                    'timestamp': time.time()
                }
                
                # In production, send image as multipart/form-data
                logger.info(f"🚨 {self.camera_id}: {incident['type']} - {incident['description']}")
                
                # Uncomment when backend is ready:
                # response = requests.post(
                #     f"{BACKEND_URL}/api/incidents",
                #     json=payload,
                #     timeout=5
                # )
                
            except Exception as e:
                logger.error(f"Failed to send to backend: {e}")


def start_camera_process(camera_id, config):
    """Start a single camera worker in a separate process"""
    worker = SingleCameraWorker(camera_id, config)
    worker.run()


def start_all_cameras():
    """Start all cameras in separate processes"""
    processes = []
    
    logger.info("=" * 60)
    logger.info("Starting Multi-Camera Surveillance System")
    logger.info("=" * 60)
    
    for camera_id, config in CAMERAS.items():
        logger.info(f"Launching {camera_id} on {config['device']}")
        
        # Create separate process for each camera
        process = mp.Process(
            target=start_camera_process,
            args=(camera_id, config)
        )
        process.start()
        processes.append(process)
        
        # Small delay to stagger startup
        time.sleep(2)
    
    logger.info("=" * 60)
    logger.info(f"✅ All {len(processes)} cameras started")
    logger.info("Press Ctrl+C to stop all cameras")
    logger.info("=" * 60)
    
    # Wait for all processes
    try:
        for process in processes:
            process.join()
    except KeyboardInterrupt:
        logger.info("\n⚠️ Stopping all cameras...")
        for process in processes:
            process.terminate()
        logger.info("✅ All cameras stopped")


if __name__ == '__main__':
    # Set multiprocessing start method
    mp.set_start_method('spawn', force=True)
    start_all_cameras()