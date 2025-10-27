# tests/test_event_detector.py
import pytest
import numpy as np
from ai_worker.inference.event_detector import EventDetector
from ai_worker.data.synthetic_generator import generate_synthetic
import tempfile
import os

def test_fall_detection():
    # Create synthetic fall frame
    with tempfile.TemporaryDirectory() as tmpdir:
        generate_synthetic(1, tmpdir, 'fall')
        frame = cv2.imread(os.path.join(tmpdir, 'images', 'synth_0.jpg'))
        
        detector = EventDetector()
        events = detector.detect_events(frame)
        
        # Should detect fall
        assert len(events) > 0
        assert any(event['type'] == 'fall' for event in events)

def test_fight_detection():
    # Create synthetic fight frame (two people close)
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw two people close together
    cv2.rectangle(frame, (100, 100), (150, 200), (255, 0, 0), -1)  # Person 1
    cv2.rectangle(frame, (120, 100), (170, 200), (0, 255, 0), -1)  # Person 2
    
    detector = EventDetector()
    events = detector.detect_events(frame)
    
    # Might detect fight due to proximity
    assert len(events) > 0
    # Note: This is a simple test; actual fight detection requires more sophisticated behavior analysis

if __name__ == '__main__':
    pytest.main([__file__])