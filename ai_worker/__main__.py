from models import yolo_detector, pose_estimator, behavior_classifier, tracker

def start_ai_worker():
    print("🚀 Starting AI Worker (as package)...")

    try:
        # Example initialization logic — customize as needed
        print("🧠 Loading YOLO detector...")
        if hasattr(yolo_detector, "load_model"):
            yolo_detector.load_model()

        print("💪 Initializing Pose Estimator...")
        if hasattr(pose_estimator, "load_model"):
            pose_estimator.load_model()

        print("⚙️ Loading Behavior Classifier...")
        if hasattr(behavior_classifier, "load_model"):
            behavior_classifier.load_model()

        print("🎯 Initializing Object Tracker...")
        if hasattr(tracker, "initialize"):
            tracker.initialize()

        print("✅ All AI modules loaded successfully! Waiting for tasks...")

    except Exception as e:
        print(f"❌ Error during AI Worker startup: {e}")

if __name__ == "__main__":
    start_ai_worker()
