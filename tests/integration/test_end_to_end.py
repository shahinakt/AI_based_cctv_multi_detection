# tests/integration/test_end_to_end.py
import pytest
import requests
import time
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from mainn import app
from backend.app.db.base import Base
from backend.app.db.session import get_db
from backend.app.core.security import create_access_token, get_password_hash
from backend.app.models.user import User, UserRole
from backend.app.models.camera import Camera
from backend.app.models.incident import IncidentType
from datetime import datetime, timezone

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_integration.db"
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

# Mock the blockchain service for integration test
@pytest.fixture
def mock_blockchain_service():
    with patch("backend.app.services.blockchain_service.BlockchainService") as MockService:
        instance = MockService.return_value
        instance.register_evidence_hash.return_value = "0xmocked_integration_tx_id"
        instance.verify_evidence_hash.return_value = True
        yield instance

# Mock Firebase for notifications
@pytest.fixture
def mock_firebase_messaging():
    with patch("backend.app.services.notification_service.firebase_admin.messaging") as MockMessaging:
        MockMessaging.send.return_value = "mocked_mobile_e2e_message_id"
        yield MockMessaging

def test_full_incident_lifecycle_backend_only(client: TestClient, db_session, mock_blockchain_service, mock_firebase_messaging):
    # 1. Register users: Admin, Security, Viewer
    admin_token, _ = create_user_in_db_and_get_token(db_session, "e2e_admin@example.com", "password123", UserRole.ADMIN)
    security_token, _ = create_user_in_db_and_get_token(db_session, "e2e_security@example.com", "password123", UserRole.SECURITY)
    viewer_token, _ = create_user_in_db_and_get_token(db_session, "e2e_viewer@example.com", "password123", UserRole.VIEWER, expo_push_token="ExponentPushToken[e2e_viewer_token]")

    # 2. Admin creates a camera
    camera_response = client.post(
        "/cameras",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "E2E Camera", "location": "E2E Location", "stream_url": "http://e2e.stream"}
    )
    assert camera_response.status_code == 200
    camera_id = camera_response.json()["id"]

    # 3. Simulate AI detection creating an incident (via Security token)
    incident_data = {
        "camera_id": camera_id,
        "type": IncidentType.THEFT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "E2E Location",
        "description": "E2E Test Incident: Theft detected.",
        "evidence": [
            {"url": "http://example.com/e2e_evidence.jpg", "hash": "0xe2e_hash", "blockchain_tx_id": None}
        ]
    }
    create_incident_response = client.post(
        "/incidents",
        headers={"Authorization": f"Bearer {security_token}"},
        json=incident_data
    )
    assert create_incident_response.status_code == 200
    incident_id = create_incident_response.json()["id"]
    assert create_incident_response.json()["status"] == "pending"
    
    # Verify evidence was registered on blockchain (mocked)
    assert create_incident_response.json()["evidence"][0]["blockchain_tx_id"] == "0xmocked_integration_tx_id"
    mock_blockchain_service.register_evidence_hash.assert_called_once_with("0xe2e_hash")

    # Verify notification was sent to viewer (mocked)
    mock_firebase_messaging.send.assert_called_once()
    call_args = mock_firebase_messaging.send.call_args.args[0]
    assert call_args.token == "ExponentPushToken[e2e_viewer_token]"
    assert call_args.notification.title == "New Incident Detected!"
    assert call_args.data["incidentId"] == str(incident_id)
    assert call_args.data["type"] == IncidentType.THEFT.value

    # 4. Security user retrieves incidents
    get_incidents_response = client.get(
        "/incidents",
        headers={"Authorization": f"Bearer {security_token}"}
    )
    assert get_incidents_response.status_code == 200
    assert len(get_incidents_response.json()) == 1
    retrieved_incident = get_incidents_response.json()[0]
    assert retrieved_incident["id"] == incident_id
    assert retrieved_incident["status"] == "pending"

    # 5. Security user acknowledges the incident
    acknowledge_response = client.post(
        f"/incidents/{incident_id}/acknowledge",
        headers={"Authorization": f"Bearer {security_token}"}
    )
    assert acknowledge_response.status_code == 200
    assert acknowledge_response.json()["message"] == "Incident acknowledged successfully"

    # 6. Verify incident status is updated in the backend
    get_incident_after_ack_response = client.get(
        f"/incidents/{incident_id}",
        headers={"Authorization": f"Bearer {security_token}"}
    )
    assert get_incident_after_ack_response.status_code == 200
    assert get_incident_after_ack_response.json()["status"] == "acknowledged"

    # 7. Verify evidence can be verified (mocked blockchain call)
    evidence_id = retrieved_incident["evidence"][0]["id"]
    verify_evidence_response = client.get(
        f"/evidence/{evidence_id}/verify",
        headers={"Authorization": f"Bearer {security_token}"}
    )
    assert verify_evidence_response.status_code == 200
    assert verify_evidence_response.json()["is_verified"] == True
    assert verify_evidence_response.json()["stored_hash"] == "0xe2e_hash"
    mock_blockchain_service.verify_evidence_hash.assert_called_once_with(
        "0xe2e_hash", "0xmocked_integration_tx_id"
    )
