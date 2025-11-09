
from ultralytics import YOLO
import torch
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class YOLODetector:
    """
    YOLOv8 detector with GPU/CPU optimization for MX350 (2GB VRAM)
    """
    
    def __init__(self, model_path: str = 'yolov8n.pt', device: str = 'cuda:0'):
        """
        Initialize YOLO detector with specific device
        
        Args:
            model_path: Path to YOLO model weights (use yolov8n.pt for 2GB GPU)
            device: 'cuda:0' for GPU or 'cpu' for CPU
        """
        self.device = device
        self.model_path = model_path
        
        # GPU Memory Management for MX350
        if device.startswith('cuda'):
            try:
                # Set memory fraction (80% of 2GB = 1.6GB)
                torch.cuda.set_per_process_memory_fraction(0.8, 0)
                
                # Clear any existing cache
                torch.cuda.empty_cache()
                
                logger.info(f"GPU memory limit set to 80% of available")
                logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
                logger.info(f"Total GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
                
            except Exception as e:
                logger.warning(f"GPU setup warning: {e}")
        
        # Load model with error handling
        try:
            logger.info(f"Loading YOLO model: {model_path}")
            self.model = YOLO(model_path)
            
            # Move model to device
            self.model.to(device)
            
            # Verify device assignment
            logger.info(f"✅ YOLO loaded successfully on {device}")
            
            if device.startswith('cuda'):
                gpu_memory = torch.cuda.memory_allocated(0) / 1024**2
                logger.info(f"GPU Memory after model load: {gpu_memory:.0f}MB / 2048MB")
                
        except Exception as e:
            logger.error(f"❌ Failed to load model on {device}: {e}")
            
            # Fallback to CPU if GPU fails
            if device.startswith('cuda'):
                logger.warning("Falling back to CPU...")
                self.device = 'cpu'
                self.model = YOLO(model_path)
                self.model.to('cpu')
                logger.info("✅ Model loaded on CPU (fallback)")
            else:
                raise
    
    def predict(self, frame, conf=0.5, iou=0.45):
        """
        Run object detection on a frame
        
        Args:
            frame: Input frame (numpy array, BGR format)
            conf: Confidence threshold (0.0-1.0)
            iou: IoU threshold for NMS
            
        Returns:
            List of detections: [{'bbox': [x1,y1,x2,y2], 'conf': float, 'class': int, 'class_name': str}]
        """
        try:
            # Force device during inference to ensure consistency
            results = self.model(
                frame, 
                device=self.device, 
                conf=conf,
                iou=iou,
                verbose=False,  # Suppress verbose output
                stream=False     # Don't use streaming for single frames
            )
            
            detections = []
            
            for r in results:
                boxes = r.boxes
                
                for box in boxes:
                    # Extract bbox coordinates
                    bbox = box.xyxy[0].cpu().numpy().tolist()
                    
                    # Extract confidence and class
                    confidence = float(box.conf[0])
                    class_id = int(box.cls[0])
                    class_name = self.model.names[class_id]
                    
                    detections.append({
                        'bbox': bbox,  # [x1, y1, x2, y2]
                        'conf': confidence,
                        'class': class_id,
                        'class_name': class_name
                    })
            
            return detections
            
        except Exception as e:
            logger.error(f"Detection error: {e}")
            return []
    
    def get_memory_usage(self):
        """Get current GPU memory usage"""
        if self.device.startswith('cuda'):
            allocated = torch.cuda.memory_allocated(0) / 1024**2
            cached = torch.cuda.memory_reserved(0) / 1024**2
            return {
                'allocated_mb': allocated,
                'cached_mb': cached,
                'device': self.device
            }
        return {'device': 'cpu', 'allocated_mb': 0, 'cached_mb': 0}
    
    def clear_cache(self):
        """Clear GPU cache to free memory"""
        if self.device.startswith('cuda'):
            torch.cuda.empty_cache()
            logger.info("GPU cache cleared")
    
    def __del__(self):
        """Cleanup when detector is destroyed"""
        if hasattr(self, 'device') and self.device.startswith('cuda'):
            torch.cuda.empty_cache()


# Quick test function
if __name__ == '__main__':
    import numpy as np
    import time
    
    print("=== Testing YOLODetector ===")
    
    # Test GPU
    try:
        detector_gpu = YOLODetector('yolov8n.pt', device='cuda:0')
        
        # Dummy frame
        test_frame = np.zeros((640, 480, 3), dtype=np.uint8)
        
        start = time.time()
        results = detector_gpu.predict(test_frame)
        elapsed = time.time() - start
        
        print(f"\n✅ GPU Detection: {elapsed*1000:.1f}ms")
        print(f"Memory: {detector_gpu.get_memory_usage()}")
        
    except Exception as e:
        print(f"❌ GPU test failed: {e}")
    
    # Test CPU
    try:
        detector_cpu = YOLODetector('yolov8n.pt', device='cpu')
        
        start = time.time()
        results = detector_cpu.predict(test_frame)
        elapsed = time.time() - start
        
        print(f"\n✅ CPU Detection: {elapsed*1000:.1f}ms")
        
    except Exception as e:
        print(f"❌ CPU test failed: {e}")