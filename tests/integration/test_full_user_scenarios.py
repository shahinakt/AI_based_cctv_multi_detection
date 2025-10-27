# tests/system/test_full_user_scenarios.py
import pytest
import requests
import time
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

# --- Configuration ---
BACKEND_URL = "http://localhost:8000" # Ensure your backend is running here
# APPIUM_SERVER_URL = 'http://localhost:4723' # Appium server URL
# MOBILE_APP_PACKAGE = 'com.yourcompany.aicctvmobile' # Android package name
# MOBILE_APP_ACTIVITY = '.MainActivity' # Android main activity
# MOBILE_APP_BUNDLE_ID = 'com.yourcompany.aicctvmobile' # iOS bundle ID

# --- Fixtures for System Test Setup ---
@pytest.fixture(scope="module")
def setup_system_users():
    # Ensure a clean state or create users if they don't exist
    # This part would typically interact with the backend API to set up test data
    
    # Register Admin
    requests.post(f"{BACKEND_URL}/register", json={"name": "Sys Admin", "email": "sys_admin@example.com", "password": "password123", "role": "admin"})
    admin_login = requests.post(f"{BACKEND_URL}/login", json={"email": "sys_admin@example.com", "password": "password123", "role": "admin"})
    admin_token = admin_login.json()["access_token"]

    # Register Security
    requests.post(f"{BACKEND_URL}/register", json={"name": "Sys Security", "email": "sys_security@example.com", "password": "password123", "role": "security"})
    security_login = requests.post(f"{BACKEND_URL}/login", json={"email": "sys_security@example.com", "password": "password123", "role": "security"})
    security_token = security_login.json()["access_token"]

    # Register Viewer (with a mock push token for notification testing)
    requests.post(f"{BACKEND_URL}/register", json={"name": "Sys Viewer", "email": "sys_viewer@example.com", "password": "password123", "role": "viewer", "expo_push_token": "ExponentPushToken[sys_viewer_token]"})
    viewer_login = requests.post(f"{BACKEND_URL}/login", json={"email": "sys_viewer@example.com", "password": "password123", "role": "viewer"})
    viewer_token = viewer_login.json()["access_token"]

    # Create a camera
    camera_response = requests.post(
        f"{BACKEND_URL}/cameras",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "System Test Camera", "location": "System Test Location", "stream_url": "http://mock.stream/system"}
    )
    camera_id = camera_response.json()["id"]

    return {
        "admin_token": admin_token,
        "security_token": security_token,
        "viewer_token": viewer_token,
        "camera_id": camera_id,
        "security_email": "sys_security@example.com",
        "security_password": "password123",
        "viewer_email": "sys_viewer@example.com",
        "viewer_password": "password123",
    }

# Mock the AI worker's detection function to simulate incidents
# In a true system test, the AI worker would be a separate running process
# and you'd feed it actual video frames or mock its input.
# For this conceptual test, we'll mock its output directly to the backend.
@pytest.fixture
def mock_ai_worker_detection():
    with patch("backend.app.services.ai_worker.AIWorkerService.detect_incidents_in_frame") as mock_detect:
        # Default to no incidents
        mock_detect.return_value = []
        yield mock_detect

# Mock the blockchain service for system test (if not running a real local blockchain)
# In a true system test, you'd interact with a running Hardhat node.
@pytest.fixture
def mock_blockchain_service_system():
    with patch("backend.app.services.blockchain_service.BlockchainService") as MockService:
        instance = MockService.return_value
        instance.register_evidence_hash.return_value = "0xsystem_tx_id"
        instance.verify_evidence_hash.return_value = True
        yield instance

# Mock Firebase for notifications
# In a true system test, you'd verify actual push notification delivery.
@pytest.fixture
def mock_firebase_messaging_system():
    with patch("backend.app.services.notification_service.firebase_admin.messaging") as MockMessaging:
        MockMessaging.send.return_value = "mocked_system_message_id"
        yield MockMessaging

def test_security_user_workflow_with_ai_detection_and_notification(
    setup_system_users,
    mock_ai_worker_detection, # Used to simulate AI output
    mock_blockchain_service_system, # Mocked blockchain interaction
    mock_firebase_messaging_system, # Mocked Firebase interaction
    # mobile_driver # Uncomment if using Appium/Detox
):
    # --- Scenario: AI detects incident -> Backend processes -> Mobile app shows incident & allows acknowledge ---

    # 1. Simulate AI detection triggering an incident
    # The AI worker (running as a separate process) would detect something
    # and then call the backend's /incidents endpoint.
    # Here, we directly call the backend endpoint as if the AI worker did.
    incident_data_from_ai = {
        "camera_id": setup_system_users["camera_id"],
        "type": IncidentType.THEFT.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "System Test Location",
        "description": "AI detected theft in system test.",
        "evidence": [
            {"url": "http://example.com/ai_evidence.jpg", "hash": "0xai_hash", "blockchain_tx_id": None}
        ]
    }
    # AI worker would use its own credentials or a system token.
    # For this test, we use the security token for simplicity.
    ai_post_incident_response = requests.post(
        f"{BACKEND_URL}/incidents",
        headers={"Authorization": f"Bearer {setup_system_users['security_token']}"},
        json=incident_data_from_ai
    )
    assert ai_post_incident_response.status_code == 200
    incident_id = ai_post_incident_response.json()["id"]
    
    # Verify backend processing: blockchain registration and notification sending
    # These mocks verify that the backend *attempted* these actions.
    mock_blockchain_service_system.register_evidence_hash.assert_called_once_with("0xai_hash")
    mock_firebase_messaging_system.send.assert_called_once()
    assert mock_firebase_messaging_system.send.call_args.args[0].token == "ExponentPushToken[sys_viewer_token]"
    assert mock_firebase_messaging_system.send.call_args.args[0].data["incidentId"] == str(incident_id)

    # --- Mobile App Interaction (Conceptual with Appium/Detox) ---
    # This section would use the mobile_driver to interact with the app UI
    # For a real test, uncomment the mobile_driver fixture and the code below.

    # # 1. Security user logs into mobile app
    # # mobile_driver.activate_app(MOBILE_APP_PACKAGE)
    # # mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Login as Security link").click()
    # # email_input = mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Email input")
    # # password_input = mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Password input")
    # # email_input.send_keys(setup_system_users["security_email"])
    # # password_input.send_keys(setup_system_users["security_password"])
    # # mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Login button").click()
    # # mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Security Dashboard title") # Wait for dashboard

    # # 2. Verify incident appears on dashboard
    # # incident_item = mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, f"Incident ID: {incident_id}")
    # # assert incident_item.is_displayed()

    # # 3. Acknowledge incident
    # # incident_item.click()
    # # mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Acknowledge Incident button").click()
    # # mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Alert: Success, Incident acknowledged successfully.")
    # # mobile_driver.find_element(AppiumBy.ACCESSIBILITY_ID, "Status: acknowledged")

    # --- Backend Verification ---
    # 4. Verify incident status in backend after mobile acknowledgment
    get_incident_response = requests.get(
        f"{BACKEND_URL}/incidents/{incident_id}",
        headers={"Authorization": f"Bearer {setup_system_users['security_token']}"}
    )
    assert get_incident_response.status_code == 200
    assert get_incident_response.json()["status"] == "acknowledged"

    print(f"System test: AI detection to mobile acknowledgment for incident {incident_id} successful.")
