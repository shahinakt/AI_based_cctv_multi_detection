# tests/backend/test_notifications.py
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from mainn import app
from backend.app.db.base import Base
from backend.app.db.session import get_db
from backend.app.core.security import create_access_token, get_password_hash
from backend.app.models.user import User, UserRole
from backend.app.models.incident import Incident, IncidentType
from backend.app.models.notification import Notification, NotificationStatus
from backend.app.models.camera import Camera
from datetime import datetime, timezone

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(name="db_session")
def db_session_fixture():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(name="client")
def client_fixture(db_session):
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

# Helper to create a user directly in the DB and return their token
def create_user_in_db_and_get_token(db_session, email: str, password: str, role: UserRole, expo_push_token: str = None):
    hashed_password = get_password_hash(password)
    user = User(name=f"{role.value} User", email=email, hashed_password=hashed_password, role=role, expo_push_token=expo_push_token)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    token = create_access_token(data={"sub": user.email, "role": user.role.value})
    return token, user.id

# Helper to create a camera directly in the DB
def create_test_camera(db_session, name: str = "Test Camera", location: str = "Test Location", stream_url: str = "http://test.stream"):
    camera = Camera(name=name, location=location, stream_url=stream_url)
    db_session.add(camera)
    db_session.commit()
    db_session.refresh(camera)
    return camera

# Mock the Firebase Admin SDK for sending messages
@pytest.fixture
def mock_firebase_messaging():
    with patch("backend.app.services.notification_service.firebase_admin.messaging") as MockMessaging:
        MockMessaging.send.return_value = "mocked_message_id"
        yield MockMessaging

# --- Test Notification Sending on Incident Creation ---
def test_send_incident_notification_to_viewers(client: TestClient, db_session, mock_firebase_messaging):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_notify@example.com", "password123", UserRole.SECURITY)
    viewer_token_1, viewer_id_1 = create_user_in_db_and_get_token(db_session, "viewer1@example.com", "password123", UserRole.VIEWER, expo_push_token="ExponentPushToken[viewer1_token]")
    viewer_token_2, viewer_id_2 = create_user_in_db_and_get_token(db_session, "viewer2@example.com", "password123", UserRole.VIEWER, expo_push_token="ExponentPushToken[viewer2_token]")
    camera = create_test_camera(db_session)

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.THEFT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Main Entrance",
        "description": "Person detected stealing a package.",
        "evidence": []
    }
    response = client.post(
        "/incidents",
        headers={"Authorization": f"Bearer {security_token}"},
        json=incident_data
    )
    assert response.status_code == 200
    incident_id = response.json()["id"]

    # Verify that firebase_admin.messaging.send was called for each viewer
    assert mock_firebase_messaging.send.call_count == 2 # For viewer1 and viewer2

    # Check calls for viewer1
    call_args_viewer1 = mock_firebase_messaging.send.call_args_list[0].args[0]
    assert call_args_viewer1.token == "ExponentPushToken[viewer1_token]"
    assert call_args_viewer1.notification.title == "New Incident Detected!"
    assert f"Type: {IncidentType.THEFT.value}, Location: Main Entrance" in call_args_viewer1.notification.body
    assert call_args_viewer1.data["incidentId"] == str(incident_id)
    assert call_args_viewer1.data["type"] == IncidentType.THEFT.value

    # Check calls for viewer2
    call_args_viewer2 = mock_firebase_messaging.send.call_args_list[1].args[0]
    assert call_args_viewer2.token == "ExponentPushToken[viewer2_token]"
    assert call_args_viewer2.data["incidentId"] == str(incident_id)

    # Verify that notifications are logged in the database
    notifications_in_db = db_session.query(Notification).filter_by(incident_id=incident_id).all()
    assert len(notifications_in_db) == 2
    assert notifications_in_db[0].user_id in [viewer_id_1, viewer_id_2]
    assert notifications_in_db[0].status == NotificationStatus.SENT
    assert notifications_in_db[1].user_id in [viewer_id_1, viewer_id_2]
    assert notifications_in_db[1].status == NotificationStatus.SENT

def test_send_notification_no_push_token_for_viewer(client: TestClient, db_session, mock_firebase_messaging):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_no_token@example.com", "password123", UserRole.SECURITY)
    # Create a viewer without an expo_push_token
    viewer_token, viewer_id = create_user_in_db_and_get_token(db_session, "viewer_no_token@example.com", "password123", UserRole.VIEWER, expo_push_token=None)
    camera = create_test_camera(db_session)

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.ABUSE.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Park",
        "description": "Abuse detected.",
        "evidence": []
    }
    response = client.post(
        "/incidents",
        headers={"Authorization": f"Bearer {security_token}"},
        json=incident_data
    )
    assert response.status_code == 200
    incident_id = response.json()["id"]

    # Verify that firebase_admin.messaging.send was NOT called for this user
    mock_firebase_messaging.send.assert_not_called()

    # Verify that a notification record is still created, but with 'failed' status
    notifications_in_db = db_session.query(Notification).filter_by(user_id=viewer_id, incident_id=incident_id).all()
    assert len(notifications_in_db) == 1
    assert notifications_in_db[0].status == NotificationStatus.FAILED # Assuming the service marks it as failed if no token

def test_send_notification_fcm_send_failure(client: TestClient, db_session, mock_firebase_messaging):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_fcm_fail@example.com", "password123", UserRole.SECURITY)
    viewer_token, viewer_id = create_user_in_db_and_get_token(db_session, "viewer_fcm_fail@example.com", "password123", UserRole.VIEWER, expo_push_token="ExponentPushToken[fcm_fail_token]")
    camera = create_test_camera(db_session)

    mock_firebase_messaging.send.side_effect = Exception("FCM service unavailable") # Simulate FCM error

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.ACCIDENT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Road",
        "description": "Car accident.",
        "evidence": []
    }
    response = client.post(
        "/incidents",
        headers={"Authorization": f"Bearer {security_token}"},
        json=incident_data
    )
    assert response.status_code == 200 # Incident creation should still succeed

    # Verify that firebase_admin.messaging.send was called, but failed
    mock_firebase_messaging.send.assert_called_once()

    # Verify that a notification record is created with 'failed' status
    notifications_in_db = db_session.query(Notification).filter_by(user_id=viewer_id).all()
    assert len(notifications_in_db) == 1
    assert notifications_in_db[0].status == NotificationStatus.FAILED
    assert "FCM service unavailable" in notifications_in_db[0].error_message

def test_register_expo_push_token_endpoint(client: TestClient, db_session):
    # User logs in, then registers their push token
    token, user_id = create_user_in_db_and_get_token(db_session, "user_register_token@example.com", "password123", UserRole.VIEWER)
    
    new_push_token = "ExponentPushToken[new_token_for_user]"
    response = client.post(
        "/users/register-push-token",
        headers={"Authorization": f"Bearer {token}"},
        json={"expo_push_token": new_push_token}
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Push token registered successfully"

    # Verify token is updated in DB
    updated_user = db_session.query(User).filter_by(id=user_id).first()
    assert updated_user.expo_push_token == new_push_token

def test_register_expo_push_token_endpoint_unauthenticated(client: TestClient):
    response = client.post(
        "/users/register-push-token",
        json={"expo_push_token": "ExponentPushToken[unauth_token]"}
    )
    assert response.status_code == 401
