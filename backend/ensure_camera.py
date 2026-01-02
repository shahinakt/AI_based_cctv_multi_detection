"""
Quick script to ensure at least one camera exists in the database
Run this before starting the mobile app if you get "camera not found" errors
"""
from app.core.database import SessionLocal
from app import models
from sqlalchemy import text

db = SessionLocal()

try:
    # Check if any cameras exist
    camera_count = db.query(models.Camera).count()
    print(f"Current cameras in database: {camera_count}")
    
    if camera_count == 0:
        print("\nNo cameras found. Creating a default camera...")
        
        # Create a default camera
        default_camera = models.Camera(
            name="Default Camera",
            stream_url="0",  # Webcam 0
            location="Office",
            is_active=True,
            admin_user_id=1  # Assumes user ID 1 exists
        )
        
        db.add(default_camera)
        db.commit()
        db.refresh(default_camera)
        
        print(f"✅ Created default camera with ID: {default_camera.id}")
        print(f"   Name: {default_camera.name}")
        print(f"   Stream URL: {default_camera.stream_url}")
        print(f"   Location: {default_camera.location}")
    else:
        print("\n✅ Cameras already exist:")
        cameras = db.query(models.Camera).all()
        for cam in cameras:
            print(f"   - ID {cam.id}: {cam.name} ({cam.stream_url})")
    
    print("\n" + "="*60)
    print("Database is ready for incident reports!")
    print("="*60)
    
except Exception as e:
    print(f"\n❌ Error: {e}")
    print("\nMake sure:")
    print("1. Database is initialized (run migrations)")
    print("2. At least one user exists (ID 1)")
    db.rollback()
finally:
    db.close()
