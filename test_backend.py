"""
Test script to check if backend is running and test incident creation
"""
import requests
import json

BASE_URL = "http://localhost:8000"

print("=" * 60)
print("BACKEND CONNECTION TEST")
print("=" * 60)

# Test 1: Check if backend is running
print("\n1. Testing backend health...")
try:
    response = requests.get(f"{BASE_URL}/health", timeout=5)
    if response.status_code == 200:
        print("✅ Backend is running!")
        print(f"   Response: {response.json()}")
    else:
        print(f"❌ Backend returned status {response.status_code}")
except requests.exceptions.ConnectionError:
    print("❌ Cannot connect to backend!")
    print("   Please start the backend server:")
    print("   cd backend")
    print("   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000")
    exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    exit(1)

# Test 2: Check cameras endpoint
print("\n2. Testing cameras endpoint...")
try:
    response = requests.get(f"{BASE_URL}/api/v1/cameras/")
    if response.status_code == 200:
        cameras = response.json()
        print(f"✅ Cameras endpoint working! Found {len(cameras)} cameras")
        if cameras:
            print(f"   First camera: ID={cameras[0].get('id')}, Name={cameras[0].get('name')}")
    elif response.status_code == 401:
        print("⚠️  Cameras endpoint requires authentication")
    else:
        print(f"❌ Status {response.status_code}: {response.text}")
except Exception as e:
    print(f"❌ Error: {e}")

# Test 3: Test incident creation (without auth for AI worker)
print("\n3. Testing incident creation...")
test_payload = {
    "camera_id": 1,
    "type": "theft",
    "severity": "medium",
    "severity_score": 50,
    "description": "[VIEWER REPORT]\nTest incident from diagnostic script"
}

try:
    response = requests.post(
        f"{BASE_URL}/api/v1/incidents/",
        json=test_payload,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"   Response status: {response.status_code}")
    print(f"   Response body: {response.text[:500]}")
    
    if response.status_code == 200 or response.status_code == 201:
        print("✅ Incident creation successful!")
        data = response.json()
        print(f"   Created incident ID: {data.get('id')}")
    elif response.status_code == 422:
        print("❌ Validation error!")
        errors = response.json()
        print(f"   Details: {json.dumps(errors, indent=2)}")
    elif response.status_code == 500:
        print("❌ Internal server error!")
        print("   Check backend terminal for error details")
    else:
        print(f"❌ Unexpected status: {response.status_code}")
        
except Exception as e:
    print(f"❌ Error: {e}")

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
