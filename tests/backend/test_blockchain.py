# tests/backend/test_blockchain.py
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
from backend.app.models.incident import Incident, Evidence, IncidentType
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
def create_user_in_db_and_get_token(db_session, email: str, password: str, role: UserRole):
    hashed_password = get_password_hash(password)
    user = User(name=f"{role.value} User", email=email, hashed_password=hashed_password, role=role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    token = create_access_token(data={"sub": user.email, "role": user.role.value})
    return token, user.id

# Mock the blockchain service
@pytest.fixture
def mock_blockchain_service():
    with patch("backend.app.services.blockchain_service.BlockchainService") as MockService:
        instance = MockService.return_value
        instance.register_evidence_hash.return_value = "0xmocked_tx_id_123"
        instance.verify_evidence_hash.return_value = True
        yield instance

# Helper to create a camera directly in the DB
def create_test_camera(db_session, name: str = "Test Camera", location: str = "Test Location", stream_url: str = "http://test.stream"):
    camera = Camera(name=name, location=location, stream_url=stream_url)
    db_session.add(camera)
    db_session.commit()
    db_session.refresh(camera)
    return camera

# --- Test Register Evidence Endpoint ---
def test_register_evidence_endpoint_success(client: TestClient, db_session, mock_blockchain_service):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_blockchain@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    # First, create an incident to attach evidence to
    incident = Incident(
        camera_id=camera.id,
        type=IncidentType.THEFT,
        timestamp=datetime.now(timezone.utc),
        location="Test Location",
        description="Test Incident"
    )
    db_session.add(incident)
    db_session.commit()
    db_session.refresh(incident)

    evidence_data = {
        "incident_id": incident.id,
        "evidence_url": "http://example.com/test_evidence.jpg",
        "evidence_hash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    }

    response = client.post(
        "/evidence/register",
        headers={"Authorization": f"Bearer {security_token}"},
        json=evidence_data
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Evidence registered on blockchain"
    assert response.json()["blockchain_tx_id"] == "0xmocked_tx_id_123"

    # Verify that the blockchain service method was called
    mock_blockchain_service.register_evidence_hash.assert_called_once_with(
        evidence_data["evidence_hash"]
    )

    # Verify that the evidence in the DB is updated with the tx_id
    updated_incident = db_session.query(Incident).filter_by(id=incident.id).first()
    assert len(updated_incident.evidence) == 1
    assert updated_incident.evidence[0].blockchain_tx_id == "0xmocked_tx_id_123"

def test_register_evidence_endpoint_invalid_incident_id(client: TestClient, db_session, mock_blockchain_service):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_invalid@example.com", "password123", UserRole.SECURITY)

    evidence_data = {
        "incident_id": 999, # Non-existent incident
        "evidence_url": "http://example.com/test_evidence.jpg",
        "evidence_hash": "0xabcdef..."
    }

    response = client.post(
        "/evidence/register",
        headers={"Authorization": f"Bearer {security_token}"},
        json=evidence_data
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Incident not found"
    mock_blockchain_service.register_evidence_hash.assert_not_called()

def test_register_evidence_endpoint_blockchain_failure(client: TestClient, db_session, mock_blockchain_service):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_blockchain_fail@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    incident = Incident(
        camera_id=camera.id,
        type=IncidentType.THEFT,
        timestamp=datetime.now(timezone.utc),
        location="Test Location",
        description="Test Incident"
    )
    db_session.add(incident)
    db_session.commit()
    db_session.refresh(incident)

    mock_blockchain_service.register_evidence_hash.return_value = None # Simulate blockchain failure

    evidence_data = {
        "incident_id": incident.id,
        "evidence_url": "http://example.com/test_evidence_fail.jpg",
        "evidence_hash": "0xfailed_hash"
    }

    response = client.post(
        "/evidence/register",
        headers={"Authorization": f"Bearer {security_token}"},
        json=evidence_data
    )
    assert response.status_code == 500 # Internal Server Error
    assert response.json()["detail"] == "Failed to register evidence on blockchain"
    mock_blockchain_service.register_evidence_hash.assert_called_once()

    # Verify that the evidence in the DB is NOT updated with a tx_id
    updated_incident = db_session.query(Incident).filter_by(id=incident.id).first()
    assert len(updated_incident.evidence) == 1
    assert updated_incident.evidence[0].blockchain_tx_id is None

# --- Test Verify Evidence Endpoint ---
def test_verify_evidence_endpoint_success(client: TestClient, db_session, mock_blockchain_service):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_verify@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    # Create an incident with evidence that has a blockchain_tx_id
    incident = Incident(
        camera_id=camera.id,
        type=IncidentType.THEFT,
        timestamp=datetime.now(timezone.utc),
        location="Test Location",
        description="Test Incident"
    )
    db_session.add(incident)
    db_session.commit()
    db_session.refresh(incident)

    evidence = Evidence(
        incident_id=incident.id,
        url="http://example.com/verify_evidence.jpg",
        hash="0xverified_hash",
        blockchain_tx_id="0xmocked_tx_id_for_verify"
    )
    db_session.add(evidence)
    db_session.commit()
    db_session.refresh(evidence)

    response = client.get(
        f"/evidence/{evidence.id}/verify",
        headers={"Authorization": f"Bearer {security_token}"}
    )

    assert response.status_code == 200
    assert response.json()["is_verified"] == True
    assert response.json()["stored_hash"] == "0xverified_hash"
    mock_blockchain_service.verify_evidence_hash.assert_called_once_with(
        "0xverified_hash", "0xmocked_tx_id_for_verify"
    )

def test_verify_evidence_endpoint_not_on_blockchain(client: TestClient, db_session, mock_blockchain_service):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_not_on_chain@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    incident = Incident(
        camera_id=camera.id,
        type=IncidentType.THEFT,
        timestamp=datetime.now(timezone.utc),
        location="Test Location",
        description="Test Incident"
    )
    db_session.add(incident)
    db_session.commit()
    db_session.refresh(incident)

    evidence = Evidence(
        incident_id=incident.id,
        url="http://example.com/unregistered_evidence.jpg",
        hash="0xunregistered_hash",
        blockchain_tx_id=None # Not yet on blockchain
    )
    db_session.add(evidence)
    db_session.commit()
    db_session.refresh(evidence)

    response = client.get(
        f"/evidence/{evidence.id}/verify",
        headers={"Authorization": f"Bearer {security_token}"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Evidence not registered on blockchain"
    mock_blockchain_service.verify_evidence_hash.assert_not_called()

def test_verify_evidence_endpoint_hash_mismatch(client: TestClient, db_session, mock_blockchain_service):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_hash_mismatch@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    incident = Incident(
        camera_id=camera.id,
        type=IncidentType.THEFT,
        timestamp=datetime.now(timezone.utc),
        location="Test Location",
        description="Test Incident"
    )
    db_session.add(incident)
    db_session.commit()
    db_session.refresh(incident)

    evidence = Evidence(
        incident_id=incident.id,
        url="http://example.com/mismatch_evidence.jpg",
        hash="0xoriginal_hash",
        blockchain_tx_id="0xmocked_tx_id_mismatch"
    )
    db_session.add(evidence)
    db_session.commit()
    db_session.refresh(evidence)

    mock_blockchain_service.verify_evidence_hash.return_value = False # Simulate hash mismatch

    response = client.get(
        f"/evidence/{evidence.id}/verify",
        headers={"Authorization": f"Bearer {security_token}"}
    )

    assert response.status_code == 200
    assert response.json()["is_verified"] == False
    assert response.json()["stored_hash"] == "0xoriginal_hash"
    mock_blockchain_service.verify_evidence_hash.assert_called_once_with(
        "0xoriginal_hash", "0xmocked_tx_id_mismatch"
    )

def test_verify_evidence_endpoint_unauthorized(client: TestClient, db_session):
    camera = create_test_camera(db_session)
    incident = Incident(camera_id=camera.id, type=IncidentType.THEFT, timestamp=datetime.now(timezone.utc), location="Test Location", description="Test Incident")
    db_session.add(incident)
    db_session.commit()
    db_session.refresh(incident)
    evidence = Evidence(incident_id=incident.id, url="http://example.com/unauth.jpg", hash="0xunauth_hash", blockchain_tx_id="0xunauth_tx")
    db_session.add(evidence)
    db_session.commit()
    db_session.refresh(evidence)

    response = client.get(f"/evidence/{evidence.id}/verify") # No token
    assert response.status_code == 401
