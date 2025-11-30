"""
Standalone Webcam Testing Script
=================================
Test all AI Worker components with your webcam independently.
Runs infinitely until Ctrl+C. Saves all incidents to separate folder.

Usage:
    python standalone_webcam_test.py
    python standalone_webcam_test.py --device cpu
    python standalone_webcam_test.py --camera 1
    python standalone_webcam_test.py --conf 0.7

Press Ctrl+C to stop.
"""

import cv2
import torch
import numpy as np
import time
import argparse
import sys
import os
from pathlib import Path
from collections import deque
import logging
from datetime import datetime
import json
import hashlib

# Add project root to path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

# Import AI Worker components
try:
    from ai_worker.models.yolo_detector import YOLODetector
    from ai_worker.models.pose_estimator import PoseEstimator
    from ai_worker.inference.incident_detector import IncidentDetector
    from ai_worker.inference.fall_detector import SmartFallDetector
    from ai_worker.inference.theft_detector import SmartTheftDetector
except ImportError as e:
    print(f"❌ Import Error: {e}")
    print("Make sure you're running from the project root and all dependencies are installed.")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class WebcamTester:
    """
    Comprehensive webcam testing system - runs infinitely until Ctrl+C
    """
    
    def __init__(
        self,
        camera_id: int = 0,
        device: str = 'cuda:0',
        confidence: float = 0.5,
        resolution: tuple = (640, 480),
        output_dir: str = 'test_output'
    ):
        """
        Initialize webcam tester
        
        Args:
            camera_id: Webcam index (0, 1, 2, etc.)
            device: 'cuda:0' for GPU or 'cpu'
            confidence: Detection confidence threshold
            resolution: Camera resolution (width, height)
            output_dir: Directory to save incidents
        """
        self.camera_id = camera_id
        self.device = device
        self.confidence = confidence
        self.resolution = resolution
        self.output_dir = output_dir
        
        # Create output directories
        self.setup_output_directories()
        
        # Performance tracking
        self.fps_history = deque(maxlen=30)
        self.frame_count = 0
        self.total_detections = 0
        self.total_incidents = 0
        self.start_time = time.time()
        
        # Statistics
        self.stats = {
            'yolo_times': [],
            'incident_times': [],
            'total_times': []
        }
        
        # Detection history for display
        self.detection_classes = {}
        
        # Initialize components
        self._check_cuda()
        self._initialize_camera()
        self._initialize_models()
        
        logger.info("=" * 70)
        logger.info("🎥 WEBCAM TESTER - READY")
        logger.info("=" * 70)
        logger.info(f"📂 Output directory: {self.output_dir}")
        logger.info(f"🎮 Device: {self.device}")
        logger.info(f"📹 Camera: {self.camera_id}")
        logger.info(f"🎯 Confidence: {self.confidence}")
        logger.info("=" * 70)
        logger.info("Press Ctrl+C to stop")
        logger.info("=" * 70)
    
    def setup_output_directories(self):
        """Create directories for saving incidents"""
        base_dir = Path(self.output_dir)
        
        # Create main directories
        self.incidents_dir = base_dir / 'incidents'
        self.screenshots_dir = base_dir / 'screenshots'
        self.logs_dir = base_dir / 'logs'
        
        # Create subdirectories for incident types
        self.fall_dir = self.incidents_dir / 'falls'
        self.theft_dir = self.incidents_dir / 'theft'
        self.violence_dir = self.incidents_dir / 'violence'
        self.intrusion_dir = self.incidents_dir / 'intrusion'
        self.other_dir = self.incidents_dir / 'other'
        
        # Create all directories
        for dir_path in [
            self.incidents_dir, self.screenshots_dir, self.logs_dir,
            self.fall_dir, self.theft_dir, self.violence_dir,
            self.intrusion_dir, self.other_dir
        ]:
            dir_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"✅ Output directories created in: {self.output_dir}")
    
    def _check_cuda(self):
        """Check CUDA availability"""
        logger.info("Checking CUDA...")
        
        if torch.cuda.is_available():
            logger.info(f"✅ CUDA Available: {torch.version.cuda}")
            logger.info(f"   GPU: {torch.cuda.get_device_name(0)}")
            logger.info(f"   Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
            
            # Set memory fraction for safety
            try:
                torch.cuda.set_per_process_memory_fraction(0.8, 0)
                torch.cuda.empty_cache()
                logger.info("   GPU memory limit set to 80%")
            except Exception as e:
                logger.warning(f"   Could not set GPU memory limit: {e}")
        else:
            logger.warning("⚠️ CUDA not available, using CPU")
            if self.device.startswith('cuda'):
                logger.warning("   Switching to CPU mode")
                self.device = 'cpu'
    
    def _initialize_camera(self):
        """Initialize webcam"""
        logger.info(f"Opening webcam {self.camera_id}...")
        
        self.cap = cv2.VideoCapture(self.camera_id)
        
        if not self.cap.isOpened():
            raise RuntimeError(f"❌ Failed to open webcam {self.camera_id}")
        
        # Set resolution
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
        
        # Reduce buffer to minimize latency
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        # Get actual resolution
        actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        logger.info(f"✅ Webcam opened: {actual_width}x{actual_height}")
    
    def _initialize_models(self):
        """Initialize all AI models"""
        logger.info("Loading AI models...")
        
        # 1. YOLO Detector
        logger.info(f"  Loading YOLO ({self.device})...")
        try:
            self.yolo = YOLODetector(model_path='yolov8n.pt', device=self.device)
            logger.info(f"  ✅ YOLO loaded on {self.yolo.device}")
        except Exception as e:
            logger.error(f"  ❌ YOLO loading failed: {e}")
            raise
        
        # 2. Incident Detectors
        logger.info("  Initializing Incident Detectors...")
        self.incident_detector = IncidentDetector(
            camera_id='webcam_test',
            alert_cooldown=5.0
        )
        self.fall_detector = SmartFallDetector('webcam_test')
        self.theft_detector = SmartTheftDetector('webcam_test')
        logger.info("  ✅ Incident detectors initialized")
    
    def process_frame(self, frame: np.ndarray) -> dict:
        """
        Process a single frame through all components
        
        Returns:
            dict with results and timing info
        """
        results = {
            'detections': [],
            'incidents': [],
            'timings': {}
        }
        
        frame_start = time.time()
        
        # 1. YOLO Detection
        yolo_start = time.time()
        detections = self.yolo.predict(frame, conf=self.confidence)
        yolo_time = (time.time() - yolo_start) * 1000
        results['detections'] = detections
        results['timings']['yolo'] = yolo_time
        self.stats['yolo_times'].append(yolo_time)
        
        # Update detection class counts
        for det in detections:
            class_name = det['class_name']
            self.detection_classes[class_name] = self.detection_classes.get(class_name, 0) + 1
        
        # 2. Incident Detection
        if detections:
            incident_start = time.time()
            
            incidents = []
            
            # Basic incident detector
            basic_incidents = self.incident_detector.analyze_frame(
                detections, frame, self.frame_count
            )
            incidents.extend(basic_incidents)
            
            # Smart fall detector
            fall_incidents = self.fall_detector.analyze_fall(
                detections, frame, self.frame_count, time.time()
            )
            incidents.extend(fall_incidents)
            
            # Smart theft detector
            theft_incidents = self.theft_detector.analyze_theft(
                detections, frame, self.frame_count, time.time()
            )
            incidents.extend(theft_incidents)
            
            incident_time = (time.time() - incident_start) * 1000
            results['incidents'] = incidents
            results['timings']['incidents'] = incident_time
            self.stats['incident_times'].append(incident_time)
        
        # Total time
        total_time = (time.time() - frame_start) * 1000
        results['timings']['total'] = total_time
        self.stats['total_times'].append(total_time)
        
        return results
    
    def save_incident(self, incident: dict, frame: np.ndarray):
        """Save incident to appropriate directory with metadata"""
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            incident_type = incident['type']
            
            # Determine directory based on incident type
            if 'fall' in incident_type.lower():
                save_dir = self.fall_dir
            elif 'theft' in incident_type.lower():
                save_dir = self.theft_dir
            elif 'violence' in incident_type.lower():
                save_dir = self.violence_dir
            elif 'intrusion' in incident_type.lower():
                save_dir = self.intrusion_dir
            else:
                save_dir = self.other_dir
            
            # Save image
            image_filename = f"{incident_type}_{timestamp}.jpg"
            image_path = save_dir / image_filename
            cv2.imwrite(str(image_path), frame)
            
            # Calculate SHA256 hash
            with open(image_path, 'rb') as f:
                sha256_hash = hashlib.sha256(f.read()).hexdigest()
            
            # Save metadata
            metadata = {
                'timestamp': timestamp,
                'type': incident_type,
                'severity': incident.get('severity', 'unknown'),
                'confidence': float(incident.get('confidence', 0)),
                'description': incident.get('description', ''),
                'frame_number': self.frame_count,
                'image_file': image_filename,
                'sha256': sha256_hash,
                'camera_id': self.camera_id
            }
            
            # Add incident-specific data
            for key, value in incident.items():
                if key not in metadata:
                    metadata[key] = str(value)
            
            # Save JSON metadata
            json_filename = f"{incident_type}_{timestamp}.json"
            json_path = save_dir / json_filename
            with open(json_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.warning(f"💾 INCIDENT SAVED: {incident_type} -> {save_dir.name}/{image_filename}")
            
        except Exception as e:
            logger.error(f"Failed to save incident: {e}")
    
    def draw_results(self, frame: np.ndarray, results: dict) -> np.ndarray:
        """Draw results on frame"""
        output = frame.copy()
        height, width = output.shape[:2]
        
        # Draw detections
        for det in results['detections']:
            bbox = [int(x) for x in det['bbox']]
            label = f"{det['class_name']} {det['conf']:.2f}"
            
            # Color based on class
            if det['class_name'] == 'person':
                color = (0, 255, 0)  # Green
            elif det['class_name'] in ['backpack', 'handbag', 'suitcase', 'laptop', 'cell phone']:
                color = (0, 165, 255)  # Orange
            else:
                color = (255, 0, 0)  # Blue
            
            cv2.rectangle(output, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 2)
            cv2.putText(output, label, (bbox[0], bbox[1] - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        # Draw incidents (ALERTS)
        if results['incidents']:
            # Create alert background
            alert_height = 40 * len(results['incidents'])
            cv2.rectangle(output, (0, 0), (width, alert_height), (0, 0, 0), -1)
            cv2.rectangle(output, (0, 0), (width, alert_height), (0, 0, 255), 3)
            
            y_offset = 30
            for incident in results['incidents']:
                severity = incident['severity'].upper()
                text = f"⚠️ {incident['type'].upper()} [{severity}]"
                cv2.putText(output, text, (10, y_offset),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                y_offset += 35
        
        # Create info panel at bottom
        panel_height = 180
        panel_y = height - panel_height
        
        # Semi-transparent black background
        overlay = output.copy()
        cv2.rectangle(overlay, (0, panel_y), (width, height), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, output, 0.3, 0, output)
        
        # Calculate FPS
        if results['timings']['total'] > 0:
            fps = 1000 / results['timings']['total']
            self.fps_history.append(fps)
        avg_fps = sum(self.fps_history) / len(self.fps_history) if self.fps_history else 0
        
        # Runtime
        runtime = time.time() - self.start_time
        runtime_str = f"{int(runtime//3600):02d}:{int((runtime%3600)//60):02d}:{int(runtime%60):02d}"
        
        # Draw info text
        info_lines = [
            f"FPS: {avg_fps:.1f}",
            f"Frame: {self.frame_count}",
            f"Runtime: {runtime_str}",
            f"Objects: {len(results['detections'])}",
            f"Total Incidents: {self.total_incidents}",
            f"YOLO: {results['timings']['yolo']:.1f}ms"
        ]
        
        y_pos = panel_y + 25
        for line in info_lines:
            cv2.putText(output, line, (10, y_pos),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            y_pos += 25
        
        # Draw detection class counts on right side
        if self.detection_classes:
            x_pos = width - 200
            y_pos = panel_y + 25
            cv2.putText(output, "Detections:", (x_pos, y_pos),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            y_pos += 25
            
            for class_name, count in sorted(self.detection_classes.items(), key=lambda x: x[1], reverse=True)[:5]:
                text = f"{class_name}: {count}"
                cv2.putText(output, text, (x_pos, y_pos),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                y_pos += 20
        
        return output
    
    def run(self):
        """Main testing loop - runs infinitely until Ctrl+C"""
        logger.info("\n🎬 Starting infinite webcam test...")
        logger.info("   Press Ctrl+C to stop\n")
        
        try:
            while True:
                # Read frame
                ret, frame = self.cap.read()
                if not ret:
                    logger.error("❌ Failed to read frame, attempting to reconnect...")
                    time.sleep(1)
                    self._initialize_camera()
                    continue
                
                self.frame_count += 1
                
                # Process frame
                results = self.process_frame(frame)
                
                # Update counters
                self.total_detections += len(results['detections'])
                
                # Handle incidents
                if results['incidents']:
                    for incident in results['incidents']:
                        self.total_incidents += 1
                        self.save_incident(incident, frame)
                        logger.warning(
                            f"🚨 INCIDENT #{self.total_incidents}: {incident['type']} "
                            f"[{incident['severity']}] - confidence: {incident.get('confidence', 0):.2f}"
                        )
                
                # Draw results
                output = self.draw_results(frame, results)
                
                # Show frame
                cv2.imshow('AI Worker Webcam Test - Press Ctrl+C to Stop', output)
                
                # Minimal wait for window to update
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    logger.info("'q' pressed - stopping...")
                    break
                
                # Print stats every 100 frames
                if self.frame_count % 100 == 0:
                    self.print_quick_stats()
        
        except KeyboardInterrupt:
            logger.info("\n\n⚠️ Ctrl+C detected - stopping...")
        
        finally:
            self.cleanup()
    
    def print_quick_stats(self):
        """Print quick statistics"""
        runtime = time.time() - self.start_time
        avg_fps = sum(self.fps_history) / len(self.fps_history) if self.fps_history else 0
        
        logger.info(
            f"📊 Frame {self.frame_count} | "
            f"FPS: {avg_fps:.1f} | "
            f"Detections: {self.total_detections} | "
            f"Incidents: {self.total_incidents} | "
            f"Runtime: {int(runtime)}s"
        )
    
    def print_final_statistics(self):
        """Print complete final statistics"""
        runtime = time.time() - self.start_time
        
        print("\n" + "=" * 70)
        print("📊 FINAL STATISTICS")
        print("=" * 70)
        
        print(f"\n⏱️ Runtime: {int(runtime//3600):02d}:{int((runtime%3600)//60):02d}:{int(runtime%60):02d}")
        print(f"📈 Total frames processed: {self.frame_count}")
        print(f"🎯 Total detections: {self.total_detections}")
        print(f"🚨 Total incidents: {self.total_incidents}")
        
        if self.stats['yolo_times']:
            print(f"\n🎯 YOLO Detection:")
            print(f"   Average: {np.mean(self.stats['yolo_times']):.1f}ms")
            print(f"   Min: {np.min(self.stats['yolo_times']):.1f}ms")
            print(f"   Max: {np.max(self.stats['yolo_times']):.1f}ms")
        
        if self.stats['incident_times']:
            print(f"\n⚠️ Incident Detection:")
            print(f"   Average: {np.mean(self.stats['incident_times']):.1f}ms")
        
        if self.stats['total_times']:
            print(f"\n⏱️ Total Processing:")
            print(f"   Average: {np.mean(self.stats['total_times']):.1f}ms")
            print(f"   Average FPS: {1000/np.mean(self.stats['total_times']):.1f}")
        
        if self.detection_classes:
            print(f"\n📦 Detection Classes:")
            for class_name, count in sorted(self.detection_classes.items(), key=lambda x: x[1], reverse=True):
                print(f"   {class_name}: {count}")
        
        if self.device.startswith('cuda'):
            print(f"\n🎮 GPU Memory:")
            allocated = torch.cuda.memory_allocated(0) / 1024**2
            cached = torch.cuda.memory_reserved(0) / 1024**2
            print(f"   Allocated: {allocated:.0f}MB")
            print(f"   Cached: {cached:.0f}MB")
        
        print(f"\n📂 Output saved to: {self.output_dir}")
        print(f"   Incidents: {self.incidents_dir}")
        print(f"   Screenshots: {self.screenshots_dir}")
        print(f"   Logs: {self.logs_dir}")
        
        print("=" * 70 + "\n")
    
    def cleanup(self):
        """Cleanup resources"""
        logger.info("\n🧹 Cleaning up...")
        
        if hasattr(self, 'cap') and self.cap:
            self.cap.release()
        
        cv2.destroyAllWindows()
        
        if self.device.startswith('cuda'):
            torch.cuda.empty_cache()
        
        # Print final statistics
        self.print_final_statistics()
        
        logger.info("✅ Cleanup complete")
        logger.info(f"✅ Test session ended - {self.frame_count} frames processed")


def main():
    parser = argparse.ArgumentParser(
        description='Standalone Webcam Testing for AI Worker - Runs until Ctrl+C'
    )
    
    parser.add_argument(
        '--camera', '-c',
        type=int,
        default=0,
        help='Camera ID (default: 0)'
    )
    
    parser.add_argument(
        '--device', '-d',
        type=str,
        default='cuda:0',
        choices=['cuda:0', 'cpu'],
        help='Device to use (default: cuda:0)'
    )
    
    parser.add_argument(
        '--conf',
        type=float,
        default=0.5,
        help='Detection confidence threshold (default: 0.5)'
    )
    
    parser.add_argument(
        '--resolution',
        type=str,
        default='640x480',
        help='Camera resolution (default: 640x480)'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        default='test_output',
        help='Output directory for incidents (default: test_output)'
    )
    
    args = parser.parse_args()
    
    # Parse resolution
    width, height = map(int, args.resolution.split('x'))
    
    # Create tester
    tester = WebcamTester(
        camera_id=args.camera,
        device=args.device,
        confidence=args.conf,
        resolution=(width, height),
        output_dir=args.output
    )
    
    # Run test (infinite loop until Ctrl+C)
    tester.run()


if __name__ == '__main__':
    main()