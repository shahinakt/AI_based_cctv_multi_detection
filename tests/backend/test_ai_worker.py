# tests/backend/test_ai_worker.py
import pytest
from unittest.mock import patch, MagicMock
import numpy as np
from backend.app.services.ai_worker import AIWorkerService # Assuming this is where your AI logic resides
from backend.app.schemas.incident import IncidentCreate, EvidenceCreate
from backend.app.models.incident import IncidentType
from datetime import datetime, timezone

# Mock AI model outputs
@pytest.fixture
def mock_yolov8_model():
    with patch("backend.app.services.ai_worker.YOLO") as MockYOLO:
        mock_model_instance = MockYOLO.return_value
        # Default to no detections
        mock_model_instance.predict.return_value = [
            MagicMock(
                boxes=MagicMock(
                    xyxy=np.array([]),
                    conf=np.array([]),
                    cls=np.array([])
                ),
                keypoints=None
            )
        ]
        yield mock_model_instance

@pytest.fixture
def mock_mediapipe_pose():
    with patch("backend.app.services.ai_worker.mp.solutions.pose") as MockPose:
        mock_pose_instance = MockPose.Pose.return_value
        mock_pose_instance.process.return_value = MagicMock(pose_landmarks=None) # Default to no pose
        yield mock_pose_instance

@pytest.fixture
def mock_incident_creation_service():
    with patch("backend.app.services.incident_service.create_incident") as MockCreateIncident:
        MockCreateIncident.return_value = MagicMock(id=1, type="theft", status="pending")
        yield MockCreateIncident

@pytest.fixture
def ai_worker_service(mock_yolov8_model, mock_mediapipe_pose):
    # Initialize AIWorkerService with mocked models
    service = AIWorkerService(
        yolov8_model_path="mock_yolo.pt",
        pose_model_path="mock_pose.pt" # Not directly used by MediaPipe, but for consistency
    )
    return service

# Dummy frame for testing
DUMMY_FRAME = np.zeros((480, 640, 3), dtype=np.uint8)
CAMERA_ID = 1
CURRENT_TIME = datetime.now(timezone.utc)

# --- Test YOLOv8 Processing ---
def test_process_frame_yolov8_detects_person(ai_worker_service, mock_yolov8_model):
    mock_yolov8_model.predict.return_value = [
        MagicMock(
            boxes=MagicMock(
                xyxy=np.array([[100, 100, 200, 200]]),
                conf=np.array([0.9]),
                cls=np.array([0]) # Assuming class 0 is 'person'
            ),
            keypoints=None
        )
    ]
    detections = ai_worker_service._process_frame_yolov8(DUMMY_FRAME)

    mock_yolov8_model.predict.assert_called_once_with(DUMMY_FRAME, verbose=False)
    assert len(detections) == 1
    assert detections[0]["label"] == "person"
    assert detections[0]["confidence"] == 0.9
    assert np.array_equal(detections[0]["box"], [100, 100, 200, 200])

def test_process_frame_yolov8_no_detection(ai_worker_service, mock_yolov8_model):
    detections = ai_worker_service._process_frame_yolov8(DUMMY_FRAME)
    assert len(detections) == 0

# --- Test MediaPipe Pose Processing ---
def test_process_frame_mediapipe_pose_detects_pose(ai_worker_service, mock_mediapipe_pose):
    mock_mediapipe_pose.Pose.return_value.process.return_value = MagicMock(
        pose_landmarks=MagicMock(
            landmark=[
                MagicMock(x=0.5, y=0.5, z=0.0, visibility=1.0), # Nose
                MagicMock(x=0.4, y=0.6, z=0.0, visibility=1.0), # Left Shoulder
            ]
        )
    )
    pose_landmarks = ai_worker_service._process_frame_mediapipe_pose(DUMMY_FRAME)

    mock_mediapipe_pose.Pose.return_value.process.assert_called_once()
    assert pose_landmarks is not None
    assert len(pose_landmarks.landmark) == 2

def test_process_frame_mediapipe_pose_no_pose(ai_worker_service, mock_mediapipe_pose):
    pose_landmarks = ai_worker_service._process_frame_mediapipe_pose(DUMMY_FRAME)
    assert pose_landmarks is None

# --- Test Incident Detection Heuristics ---
def test_theft_detection_heuristic_triggered(ai_worker_service, mock_yolov8_model, mock_incident_creation_service):
    # Mock YOLO to detect a 'person' and an 'object' (e.g., class 1 is 'bag')
    mock_yolov8_model.predict.return_value = [
        MagicMock(
            boxes=MagicMock(
                xyxy=np.array([[100, 100, 200, 200], [110, 110, 150, 150]]), # Person and object overlapping
                conf=np.array([0.9, 0.8]),
                cls=np.array([0, 1]) # 0: person, 1: bag (mocked)
            ),
            keypoints=None
        )
    ]
    
    incidents = ai_worker_service.detect_incidents_in_frame(DUMMY_FRAME, CAMERA_ID, CURRENT_TIME)

    assert len(incidents) == 1
    assert incidents[0].type == IncidentType.THEFT
    assert "Person detected with object" in incidents[0].description
    mock_incident_creation_service.assert_called_once()

def test_theft_detection_heuristic_not_triggered_no_overlap(ai_worker_service, mock_yolov8_model, mock_incident_creation_service):
    # Person and object not overlapping
    mock_yolov8_model.predict.return_value = [
        MagicMock(
            boxes=MagicMock(
                xyxy=np.array([[100, 100, 200, 200], [300, 300, 350, 350]]), # Person and object far apart
                conf=np.array([0.9, 0.8]),
                cls=np.array([0, 1])
            ),
            keypoints=None
        )
    ]
    incidents = ai_worker_service.detect_incidents_in_frame(DUMMY_FRAME, CAMERA_ID, CURRENT_TIME)
    assert len(incidents) == 0
    mock_incident_creation_service.assert_not_called()

def test_abuse_detection_heuristic_triggered(ai_worker_service, mock_mediapipe_pose, mock_incident_creation_service):
    # Mock MediaPipe pose to simulate an "abuse" pose (e.g., raised arm, close proximity)
    # Simplified: two people very close, one with a raised arm (shoulder/wrist close)
    mock_mediapipe_pose.Pose.return_value.process.return_value = MagicMock(
        pose_landmarks=MagicMock(
            landmark=[
                MagicMock(x=0.4, y=0.5, z=0.0, visibility=1.0), # Person 1 Nose
                MagicMock(x=0.3, y=0.6, z=0.0, visibility=1.0), # Person 1 Left Shoulder
                MagicMock(x=0.3, y=0.3, z=0.0, visibility=1.0), # Person 1 Left Wrist (raised)
                MagicMock(x=0.6, y=0.5, z=0.0, visibility=1.0), # Person 2 Nose (close to P1)
                MagicMock(x=0.5, y=0.6, z=0.0, visibility=1.0), # Person 2 Left Shoulder
            ]
        )
    )
    incidents = ai_worker_service.detect_incidents_in_frame(DUMMY_FRAME, CAMERA_ID, CURRENT_TIME)

    assert len(incidents) == 1
    assert incidents[0].type == IncidentType.ABUSE
    assert "Abnormal pose detected" in incidents[0].description
    mock_incident_creation_service.assert_called_once()

def test_abuse_detection_heuristic_not_triggered_normal_pose(ai_worker_service, mock_mediapipe_pose, mock_incident_creation_service):
    # Mock MediaPipe to detect a normal pose
    mock_mediapipe_pose.Pose.return_value.process.return_value = MagicMock(
        pose_landmarks=MagicMock(
            landmark=[
                MagicMock(x=0.5, y=0.5, z=0.0, visibility=1.0), # Normal pose
            ]
        )
    )
    incidents = ai_worker_service.detect_incidents_in_frame(DUMMY_FRAME, CAMERA_ID, CURRENT_TIME)
    assert len(incidents) == 0
    mock_incident_creation_service.assert_not_called()

def test_no_incident_detected_no_detections(ai_worker_service, mock_yolov8_model, mock_mediapipe_pose, mock_incident_creation_service):
    # Both YOLO and MediaPipe return no relevant detections
    incidents = ai_worker_service.detect_incidents_in_frame(DUMMY_FRAME, CAMERA_ID, CURRENT_TIME)
    assert len(incidents) == 0
    mock_incident_creation_service.assert_not_called()

def test_ai_worker_integration_with_incident_service_failure(ai_worker_service, mock_yolov8_model, mock_incident_creation_service):
    # Simulate detection
    mock_yolov8_model.predict.return_value = [
        MagicMock(
            boxes=MagicMock(
                xyxy=np.array([[100, 100, 200, 200], [110, 110, 150, 150]]),
                conf=np.array([0.9, 0.8]),
                cls=np.array([0, 1])
            ),
            keypoints=None
        )
    ]
    # Simulate incident creation service failure
    mock_incident_creation_service.side_effect = Exception("DB write failed")

    with pytest.raises(Exception, match="DB write failed"):
        ai_worker_service.detect_incidents_in_frame(DUMMY_FRAME, CAMERA_ID, CURRENT_TIME)

    mock_incident_creation_service.assert_called_once()
