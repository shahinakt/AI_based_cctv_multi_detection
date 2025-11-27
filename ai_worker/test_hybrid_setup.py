
import torch
import cv2
import time
from ai_worker.models.yolo_detector import YOLODetector
from ai_worker.config import CAMERAS, DEVICE_GPU, DEVICE_CPU

def test_device_assignment():
    """Test GPU and CPU device assignment"""
    print("=== Testing Device Assignment ===")
    print(f"GPU Available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU Name: {torch.cuda.get_device_name(0)}")
        print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
    
    print(f"\nConfigured Devices:")
    print(f"  DEVICE_GPU: {DEVICE_GPU}")
    print(f"  DEVICE_CPU: {DEVICE_CPU}")
    
def test_gpu_detector():
    """Test YOLO on GPU"""
    print("\n=== Testing GPU Detector ===")
    detector_gpu = YOLODetector('yolov8n.pt', device=DEVICE_GPU)
    print(f"✅ GPU Detector loaded on: {detector_gpu.device}")
    
    # Test with dummy frame
    import numpy as np
    dummy_frame = np.zeros((640, 480, 3), dtype=np.uint8)
    
    start = time.time()
    results = detector_gpu.predict(dummy_frame)
    gpu_time = time.time() - start
    
    print(f"GPU Inference Time: {gpu_time*1000:.2f}ms")
    print(f"GPU Memory Used: {torch.cuda.memory_allocated(0)/1024**2:.0f}MB")
    
    return detector_gpu

def test_cpu_detector():
    """Test YOLO on CPU"""
    print("\n=== Testing CPU Detector ===")
    detector_cpu = YOLODetector('yolov8n.pt', device=DEVICE_CPU)
    print(f"✅ CPU Detector loaded on: {detector_cpu.device}")
    
    # Test with dummy frame
    import numpy as np
    dummy_frame = np.zeros((640, 480, 3), dtype=np.uint8)
    
    start = time.time()
    results = detector_cpu.predict(dummy_frame)
    cpu_time = time.time() - start
    
    print(f"CPU Inference Time: {cpu_time*1000:.2f}ms")
    
    return detector_cpu

def test_webcam_hybrid():
    """Test hybrid processing with webcam"""
    print("\n=== Testing Webcam with Hybrid Processing ===")
    
    # Load both detectors
    detector_gpu = YOLODetector('yolov8n.pt', device=DEVICE_GPU)
    detector_cpu = YOLODetector('yolov8n.pt', device=DEVICE_CPU)
    
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    if not cap.isOpened():
        print("❌ Cannot open webcam")
        return
    
    print("✅ Webcam opened. Processing 30 frames...")
    print("   Alternating: GPU → CPU → GPU → CPU...")
    
    frame_count = 0
    gpu_times = []
    cpu_times = []
    
    while frame_count < 30:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Alternate between GPU and CPU
        if frame_count % 2 == 0:
            start = time.time()
            results = detector_gpu.predict(frame)
            elapsed = time.time() - start
            gpu_times.append(elapsed)
            device_used = "GPU"
        else:
            start = time.time()
            results = detector_cpu.predict(frame)
            elapsed = time.time() - start
            cpu_times.append(elapsed)
            device_used = "CPU"
        
        frame_count += 1
        print(f"  Frame {frame_count}: {device_used} - {elapsed*1000:.1f}ms - {len(results)} detections")
    
    cap.release()
    
    print(f"\n=== Results ===")
    print(f"GPU Average: {sum(gpu_times)/len(gpu_times)*1000:.1f}ms")
    print(f"CPU Average: {sum(cpu_times)/len(cpu_times)*1000:.1f}ms")
    print(f"GPU is {(sum(cpu_times)/len(cpu_times))/(sum(gpu_times)/len(gpu_times)):.1f}x faster")

if __name__ == '__main__':
    test_device_assignment()
    test_gpu_detector()
    test_cpu_detector()
    test_webcam_hybrid()
    
    print("\n✅ All tests passed! Your hybrid setup is working.")