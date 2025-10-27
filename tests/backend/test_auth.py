# tests/backend/test_auth.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from mainn import app
from backend.app.db.base import Base
from backend.app.db.session import get_db
from backend.app.core.security import create_access_token, verify_password, get_password_hash
from backend.app.models.user import User, UserRole
from backend.app.models.camera import Camera # Assuming Camera creation is admin-only
from backend.app.schemas.camera import CameraCreate
from backend.app.core.config import settings

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Fixture to set up and tear down a test database session
@pytest.fixture(name="db_session")
def db_session_fixture():
    Base.metadata.create_all(bind=engine)  # Create tables
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)  # Drop tables after test

# Fixture to provide a test client with the overridden database dependency
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

# --- Test User Registration ---
def test_register_user_success(client: TestClient):
    response = client.post(
        "/register",
        json={"name": "New User", "email": "new@example.com", "password": "password123", "role": "viewer"}
    )
    assert response.status_code == 200
    assert response.json()["message"] == "User registered successfully"
    assert "id" in response.json()
    assert response.json()["email"] == "new@example.com"

def test_register_user_duplicate_email(client: TestClient):
    client.post(
        "/register",
        json={"name": "User One", "email": "duplicate@example.com", "password": "password123", "role": "viewer"}
    )
    response = client.post(
        "/register",
        json={"name": "User Two", "email": "duplicate@example.com", "password": "password456", "role": "security"}
    )
    assert response.status_code == 400
    assert "User with this email already exists" in response.json()["detail"]

def test_register_user_invalid_role(client: TestClient):
    response = client.post(
        "/register",
        json={"name": "Invalid Role User", "email": "invalid_role@example.com", "password": "password123", "role": "super_user"}
    )
    assert response.status_code == 422 # Unprocessable Entity for Pydantic validation error

# --- Test User Login ---
def test_login_viewer_success(client: TestClient, db_session):
    create_user_in_db_and_get_token(db_session, "viewer@example.com", "password123", UserRole.VIEWER)
    response = client.post(
        "/login",
        json={"email": "viewer@example.com", "password": "password123", "role": "viewer"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"

def test_login_security_success(client: TestClient, db_session):
    create_user_in_db_and_get_token(db_session, "security@example.com", "password123", UserRole.SECURITY)
    response = client.post(
        "/login",
        json={"email": "security@example.com", "password": "password123", "role": "security"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_login_admin_success(client: TestClient, db_session):
    create_user_in_db_and_get_token(db_session, "admin@example.com", "password123", UserRole.ADMIN)
    response = client.post(
        "/login",
        json={"email": "admin@example.com", "password": "password123", "role": "admin"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_login_invalid_credentials(client: TestClient, db_session):
    create_user_in_db_and_get_token(db_session, "user_for_invalid@example.com", "password123", UserRole.VIEWER)
    response = client.post(
        "/login",
        json={"email": "user_for_invalid@example.com", "password": "wrongpassword", "role": "viewer"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"

def test_login_nonexistent_user(client: TestClient):
    response = client.post(
        "/login",
        json={"email": "nonexistent@example.com", "password": "password123", "role": "viewer"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"

def test_login_wrong_role_for_user(client: TestClient, db_session):
    create_user_in_db_and_get_token(db_session, "user_wrong_role@example.com", "password123", UserRole.VIEWER)
    response = client.post(
        "/login",
        json={"email": "user_wrong_role@example.com", "password": "password123", "role": "admin"} # User is viewer, trying to login as admin
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid role for this user"

# --- Test Protected Endpoints and Role Enforcement ---
def test_protected_endpoint_no_token(client: TestClient):
    response = client.get("/incidents") # Assuming /incidents is protected
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"

def test_protected_endpoint_invalid_token(client: TestClient):
    response = client.get("/incidents", headers={"Authorization": "Bearer invalid_token"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Could not validate credentials"

def test_protected_endpoint_valid_token_access(client: TestClient, db_session):
    token, _ = create_user_in_db_and_get_token(db_session, "valid_access@example.com", "password123", UserRole.SECURITY)
    response = client.get("/incidents", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200 # Assuming 200 for an empty list or success
    assert isinstance(response.json(), list) # Expecting a list of incidents

def test_role_enforcement_admin_only_endpoint(client: TestClient, db_session):
    admin_token, _ = create_user_in_db_and_get_token(db_session, "admin_access@example.com", "password123", UserRole.ADMIN)
    security_token, _ = create_user_in_db_and_get_token(db_session, "security_access@example.com", "password123", UserRole.SECURITY)
    viewer_token, _ = create_user_in_db_and_get_token(db_session, "viewer_access@example.com", "password123", UserRole.VIEWER)

    camera_data = CameraCreate(name="Test Camera", location="Test Location", stream_url="http://test.stream").model_dump()

    # Admin can create camera
    admin_response = client.post(
        "/cameras",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=camera_data
    )
    assert admin_response.status_code == 200
    assert admin_response.json()["name"] == "Test Camera"

    # Security user cannot create camera
    security_response = client.post(
        "/cameras",
        headers={"Authorization": f"Bearer {security_token}"},
        json=camera_data
    )
    assert security_response.status_code == 403
    assert security_response.json()["detail"] == "Not enough permissions"

    # Viewer user cannot create camera
    viewer_response = client.post(
        "/cameras",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json=camera_data
    )
    assert viewer_response.status_code == 403
    assert viewer_response.json()["detail"] == "Not enough permissions"

def test_password_hashing_and_verification():
    password = "mysecretpassword"
    hashed_password = get_password_hash(password)
    assert verify_password(password, hashed_password)
    assert not verify_password("wrongpassword", hashed_password)
    assert len(hashed_password) > 0 # Ensure hash is not empty
