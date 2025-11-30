"""
Integration Test Script
Tests the complete flow: AI Worker → Backend → Database → Frontend

Run this to diagnose why incidents aren't showing in dashboard
"""
import requests
import time
import json

BACKEND_URL = "http://localhost:8000"
AI_WORKER_URL = "http://localhost:8765"

def test_backend():
    """Test 1: Backend is running"""
    print("\n" + "="*70)
    print("TEST 1: Backend Health Check")
    print("="*70)
    try:
        resp = requests.get(f"{BACKEND_URL}/health", timeout=5)
        print(f"✅ Backend is UP: {resp.json()}")
        return True
    except Exception as e:
        print(f"❌ Backend is DOWN: {e}")
        print("   Start backend with: cd backend && uvicorn app.main:app --reload")
        return False


def test_ai_worker():
    """Test 2: AI Worker API is running"""
    print("\n" + "="*70)
    print("TEST 2: AI Worker Health Check")
    print("="*70)
    try:
        resp = requests.get(f"{AI_WORKER_URL}/health", timeout=5)
        print(f"✅ AI Worker is UP: {resp.json()}")
        return True
    except Exception as e:
        print(f"❌ AI Worker is DOWN: {e}")
        print("   Start AI Worker with: python start_ai_worker_integrated.py")
        return False


def test_cameras():
    """Test 3: Cameras exist in backend"""
    print("\n" + "="*70)
    print("TEST 3: Camera Registration")
    print("="*70)
    try:
        resp = requests.get(f"{BACKEND_URL}/api/v1/cameras", timeout=5)
        cameras = resp.json()
        print(f"📹 Found {len(cameras)} cameras in backend:")
        
        if len(cameras) == 0:
            print("   ⚠️ No cameras registered!")
            print("   Add a camera via the frontend dashboard first")
            return False
        
        for cam in cameras:
            status = cam.get('streaming_status', 'unknown')
            print(f"   - Camera {cam['id']}: {cam['name']}")
            print(f"     Stream: {cam['stream_url']}")
            print(f"     Status: {status}")
            print(f"     Active: {cam['is_active']}")
        
        return True
    except Exception as e:
        print(f"❌ Failed to get cameras: {e}")
        return False


def test_ai_worker_cameras():
    """Test 4: AI Worker has active cameras"""
    print("\n" + "="*70)
    print("TEST 4: AI Worker Camera Status")
    print("="*70)
    try:
        resp = requests.get(f"{AI_WORKER_URL}/api/worker/cameras/status", timeout=5)
        cameras = resp.json()
        
        if len(cameras) == 0:
            print("   ⚠️ AI Worker has no active cameras!")
            print("   This means cameras aren't being processed")
            return False
        
        print(f"✅ AI Worker processing {len(cameras)} cameras:")
        for cam_id, status in cameras.items():
            print(f"   - Camera {cam_id}:")
            print(f"     Status: {status['status']}")
            print(f"     FPS: {status.get('fps', 0):.1f}")
            print(f"     Total Frames: {status.get('total_frames', 0)}")
        
        return True
    except Exception as e:
        print(f"❌ Failed to get AI Worker camera status: {e}")
        return False


def test_incidents():
    """Test 5: Incidents in database"""
    print("\n" + "="*70)
    print("TEST 5: Incident Detection")
    print("="*70)
    try:
        resp = requests.get(f"{BACKEND_URL}/api/v1/incidents?limit=10", timeout=5)
        incidents = resp.json()
        
        if len(incidents) == 0:
            print("   ⚠️ No incidents found in database")
            print("   This is the problem! AI Worker is not detecting or sending incidents")
            return False
        
        print(f"✅ Found {len(incidents)} incidents:")
        for inc in incidents[:5]:
            print(f"   - {inc['type']} (Severity: {inc['severity']})")
            print(f"     Camera: {inc['camera_id']}")
            print(f"     Time: {inc['timestamp']}")
            print(f"     Description: {inc['description']}")
        
        return True
    except Exception as e:
        print(f"❌ Failed to get incidents: {e}")
        return False


def test_create_fake_incident():
    """Test 6: Create fake incident to test pipeline"""
    print("\n" + "="*70)
    print("TEST 6: Create Test Incident (Backend → Frontend)")
    print("="*70)
    
    try:
        # First, get a camera ID
        resp = requests.get(f"{BACKEND_URL}/api/v1/cameras", timeout=5)
        cameras = resp.json()
        
        if len(cameras) == 0:
            print("   ⚠️ No cameras available to test with")
            return False
        
        camera_id = cameras[0]['id']
        
        # Create test incident
        incident_data = {
            "camera_id": camera_id,
            "type": "fall_health",
            "severity": "high",
            "severity_score": 85.5,
            "description": "🧪 TEST INCIDENT - Created by integration test script"
        }
        
        resp = requests.post(
            f"{BACKEND_URL}/api/v1/incidents/",
            json=incident_data,
            timeout=5
        )
        
        if resp.status_code in [200, 201]:
            incident = resp.json()
            print(f"✅ Test incident created successfully!")
            print(f"   ID: {incident['id']}")
            print(f"   Type: {incident['type']}")
            print(f"   Check your dashboard - this should appear!")
            return True
        else:
            print(f"❌ Failed to create incident: {resp.status_code}")
            print(f"   Response: {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Failed to create test incident: {e}")
        return False


def run_all_tests():
    """Run all integration tests"""
    print("\n")
    print("█" * 70)
    print("█  AI WORKER ↔ BACKEND ↔ FRONTEND INTEGRATION TEST")
    print("█" * 70)
    
    results = {
        "Backend Running": test_backend(),
        "AI Worker Running": test_ai_worker(),
        "Cameras Registered": test_cameras(),
        "AI Worker Processing": test_ai_worker_cameras(),
        "Incidents Detected": test_incidents(),
    }
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    
    all_passed = all(results.values())
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("="*70)
    
    if all_passed:
        print("\n🎉 ALL TESTS PASSED!")
        print("If dashboard still doesn't show incidents, the issue is in frontend.")
    else:
        print("\n⚠️ SOME TESTS FAILED - See above for details")
        print("\nMost Common Issues:")
        print("1. AI Worker not running → Run: python start_ai_worker_integrated.py")
        print("2. No cameras registered → Add camera via dashboard first")
        print("3. Detection thresholds too high → Set: export INCIDENT_DEBUG=1")
        
        # Offer to create test incident
        if results["Backend Running"] and results["Cameras Registered"]:
            print("\n💡 TIP: Create a test incident to verify backend→frontend pipeline:")
            test_create_fake_incident()
    
    print("\n")


if __name__ == "__main__":
    run_all_tests()