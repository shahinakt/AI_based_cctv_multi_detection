"""
Script to assign admin users to cameras that don't have owners
This fixes the "Unknown" user display issue in the mobile app
"""
from app.database import SessionLocal
from app.models import Camera, User, RoleEnum

def fix_camera_owners():
    db = SessionLocal()
    try:
        # Get the first admin user
        admin_user = db.query(User).filter(User.role == RoleEnum.admin).first()
        
        if not admin_user:
            print("ERROR: No admin user found in database!")
            print("Please create an admin user first")
            return
        
        print(f"Found admin user: {admin_user.username} (ID: {admin_user.id})")
        
        # Get all cameras without an admin_user_id
        cameras_without_owner = db.query(Camera).filter(Camera.admin_user_id == None).all()
        
        if not cameras_without_owner:
            print("All cameras already have owners assigned!")
            return
        
        print(f"\nFound {len(cameras_without_owner)} cameras without owners:")
        for camera in cameras_without_owner:
            print(f"  - Camera {camera.id}: {camera.name}")
        
        # Assign the admin user to all cameras
        print(f"\nAssigning {admin_user.username} as owner to all cameras...")
        for camera in cameras_without_owner:
            camera.admin_user_id = admin_user.id
            print(f"  ✓ Camera {camera.id}: {camera.name}")
        
        db.commit()
        print(f"\n✅ Successfully assigned owner to {len(cameras_without_owner)} cameras!")
        
    except Exception as e:
        print(f"ERROR: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_camera_owners()
