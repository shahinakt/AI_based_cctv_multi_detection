"""
Test all critical imports for the AI Worker package.
Run from project root:
    python -m ai_worker.test_imports
"""

print("🔍 Testing ai_worker imports...\n")

def test(name, fn):
    try:
        fn()
        print(f"✅ {name} imported")
    except Exception as e:
        print(f"❌ {name} error: {type(e).__name__}: {e}")

# -----------------------------
# TEST: config
# -----------------------------
def test_config():
    from ai_worker import config
test("config", test_config)

# -----------------------------
# TEST: YOLO Detector
# -----------------------------
def test_yolo():
    from ai_worker.models.yolo_detector import YOLODetector
test("YOLODetector", test_yolo)

# -----------------------------
# TEST: Incident Detector
# -----------------------------
def test_incident():
    from ai_worker.inference.incident_detector import IncidentDetector
test("IncidentDetector", test_incident)

# -----------------------------
# TEST: Multi-camera worker
# -----------------------------
def test_multi_worker():
    # Just verify the multi-camera module can be imported
    from ai_worker.inference.multi_camera_worker import start_all_cameras
test("MultiCameraWorker (start_all_cameras)", test_multi_worker)


# -----------------------------
# TEST: Stream worker
# -----------------------------
def test_stream_worker():
    from ai_worker.inference.stream_worker import StreamProcessor
test("StreamWorker", test_stream_worker)

# -----------------------------
# FINISHED
# -----------------------------
print("\n🎉 Import testing completed.")

