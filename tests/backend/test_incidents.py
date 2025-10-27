# tests/backend/test_incidents.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from mainn import app
from backend.app.db.base import Base
from backend.app.db.session import get_db
from backend.app.core.security import create_access_token, get_password_hash
from backend.app.models.user import User, UserRole
from backend.app.models.incident import Incident, IncidentStatus, IncidentType, Evidence
from backend.app.models.camera import Camera
from datetime import datetime, timezone, timedelta

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

# Helper to create a camera directly in the DB
def create_test_camera(db_session, name: str = "Test Camera", location: str = "Test Location", stream_url: str = "http://test.stream"):
    camera = Camera(name=name, location=location, stream_url=stream_url)
    db_session.add(camera)
    db_session.commit()
    db_session.refresh(camera)
    return camera

# --- Test Incident Creation ---
def test_create_incident_success(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_create@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.THEFT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Main Entrance",
        "description": "Person detected stealing a package.",
        "evidence": [
            {"url": "http://example.com/evidence/img1.jpg", "hash": "hash1", "blockchain_tx_id": None}
        ]
    }
    response = client.post(
        "/incidents",
        headers={"Authorization": f"Bearer {security_token}"},
        json=incident_data
    )
    assert response.status_code == 200
    assert response.json()["type"] == IncidentType.THEFT.value
    assert response.json()["status"] == IncidentStatus.PENDING.value
    assert "id" in response.json()
    assert len(response.json()["evidence"]) == 1
    assert response.json()["evidence"][0]["url"] == "http://example.com/evidence/img1.jpg"

def test_create_incident_unauthorized_role(client: TestClient, db_session):
    viewer_token, _ = create_user_in_db_and_get_token(db_session, "viewer_create@example.com", "password123", UserRole.VIEWER)
    camera = create_test_camera(db_session)

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.ABUSE.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Playground",
        "description": "Child abuse detected.",
        "evidence": []
    }
    response = client.post(
        "/incidents",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json=incident_data
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Not enough permissions"

def test_create_incident_invalid_camera_id(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_invalid_cam@example.com", "password123", UserRole.SECURITY)

    incident_data = {
        "camera_id": 999, # Non-existent camera
        "type": IncidentType.ACCIDENT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Unknown",
        "description": "Accident at unknown location.",
        "evidence": []
    }
    response = client.post(
        "/incidents",
        headers={"Authorization": f"Bearer {security_token}"},
        json=incident_data
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Camera not found"

# --- Test Get Incidents ---
def test_get_incidents_list(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_get_list@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    # Create a few incidents
    for i in range(3):
        incident_data = {
            "camera_id": camera.id,
            "type": IncidentType.THEFT.value,
            "timestamp": (datetime.now(timezone.utc) - timedelta(minutes=i)).isoformat(),
            "location": "Location A",
            "description": f"Incident {i}",
            "evidence": []
        }
        client.post("/incidents", headers={"Authorization": f"Bearer {security_token}"}, json=incident_data)

    response = client.get("/incidents", headers={"Authorization": f"Bearer {security_token}"})
    assert response.status_code == 200
    assert len(response.json()) == 3
    # Incidents should be ordered by timestamp descending by default
    assert response.json()[0]["description"] == "Incident 0"
    assert response.json()[2]["description"] == "Incident 2"

def test_get_incidents_by_id(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_get_id@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.ACCIDENT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Warehouse",
        "description": "Forklift accident.",
        "evidence": []
    }
    create_response = client.post("/incidents", headers={"Authorization": f"Bearer {security_token}"}, json=incident_data)
    incident_id = create_response.json()["id"]

    get_response = client.get(f"/incidents/{incident_id}", headers={"Authorization": f"Bearer {security_token}"})
    assert get_response.status_code == 200
    assert get_response.json()["id"] == incident_id
    assert get_response.json()["type"] == IncidentType.ACCIDENT.value
    assert get_response.json()["status"] == IncidentStatus.PENDING.value

def test_get_incidents_by_id_not_found(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_get_not_found@example.com", "password123", UserRole.SECURITY)
    response = client.get("/incidents/999", headers={"Authorization": f"Bearer {security_token}"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Incident not found"

# --- Test Acknowledge Incident ---
def test_acknowledge_incident_success(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_ack@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.HEALTH_EMERGENCY.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Hospital Ward",
        "description": "Patient collapse.",
        "evidence": []
    }
    create_response = client.post("/incidents", headers={"Authorization": f"Bearer {security_token}"}, json=incident_data)
    incident_id = create_response.json()["id"]

    ack_response = client.post(f"/incidents/{incident_id}/acknowledge", headers={"Authorization": f"Bearer {security_token}"})
    assert ack_response.status_code == 200
    assert ack_response.json()["message"] == "Incident acknowledged successfully"

    # Verify status change in DB
    get_response = client.get(f"/incidents/{incident_id}", headers={"Authorization": f"Bearer {security_token}"})
    assert get_response.status_code == 200
    assert get_response.json()["status"] == IncidentStatus.ACKNOWLEDGED.value

def test_acknowledge_incident_already_acknowledged(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_ack_twice@example.com", "password123", UserRole.SECURITY)
    camera = create_test_camera(db_session)

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.THEFT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Store",
        "description": "Shoplifting.",
        "status": IncidentStatus.ACKNOWLEDGED.value, # Pre-set as acknowledged
        "evidence": []
    }
    incident = Incident(**incident_data)
    db_session.add(incident)
    db_session.commit()
    db_session.refresh(incident)

    ack_response = client.post(f"/incidents/{incident.id}/acknowledge", headers={"Authorization": f"Bearer {security_token}"})
    assert ack_response.status_code == 400
    assert ack_response.json()["detail"] == "Incident is already acknowledged"

def test_acknowledge_incident_by_viewer_forbidden(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_for_viewer_ack@example.com", "password123", UserRole.SECURITY)
    viewer_token, _ = create_user_in_db_and_get_token(db_session, "viewer_ack_forbidden@example.com", "password123", UserRole.VIEWER)
    camera = create_test_camera(db_session)

    incident_data = {
        "camera_id": camera.id,
        "type": IncidentType.THEFT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Store",
        "description": "Shoplifting.",
        "evidence": []
    }
    create_response = client.post("/incidents", headers={"Authorization": f"Bearer {security_token}"}, json=incident_data)
    incident_id = create_response.json()["id"]

    ack_response = client.post(f"/incidents/{incident_id}/acknowledge", headers={"Authorization": f"Bearer {viewer_token}"})
    assert ack_response.status_code == 403
    assert ack_response.json()["detail"] == "Not enough permissions"

# --- Test Camera Feeds ---
def test_get_camera_feeds_success(client: TestClient, db_session):
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_feeds@example.com", "password123", UserRole.SECURITY)
    camera1 = create_test_camera(db_session, name="Cam 1", stream_url="http://cam1.stream")
    camera2 = create_test_camera(db_session, name="Cam 2", stream_url="http://cam2.stream")

    response = client.get("/camera-feeds", headers={"Authorization": f"Bearer {security_token}"})
    assert response.status_code == 200
    assert len(response.json()) == 2
    assert any(feed["name"] == "Cam 1" for feed in response.json())
    assert any(feed["name"] == "Cam 2" for feed in response.json())

def test_get_camera_feeds_unauthorized(client: TestClient):
    response = client.get("/camera-feeds")
    assert response.status_code == 401
