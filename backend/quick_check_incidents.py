#!/usr/bin/env python
"""Quick test to check what incidents exist and who can see them"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app import models

db = SessionLocal()

try:
    # Get recent incidents  
    incidents = db.query(models.Incident).order_by(models.Incident.id.desc()).limit(10).all()
    
    print(f"\n📊 Recent Incidents (last 10):")
    for inc in incidents:
        camera = inc.camera
        camera_owner_id = camera.admin_user_id if camera else None
        camera_name = camera.name if camera else "MISSING"
        
        print(f"\nIncident #{inc.id}:")
        print(f"  Type: {inc.type}")
        print(f"  Camera ID: {inc.camera_id}")
        print(f"  Camera Name: {camera_name}")
        print(f"  Camera Owner ID: {camera_owner_id}")
        print(f"  Assigned User ID: {inc.assigned_user_id}")
        print(f"  Timestamp: {inc.timestamp}")
        print(f"  Visible to viewers (camera_id >= 29): {inc.camera_id >= 29}")
    
    # Get all users
    users = db.query(models.User).all()
    print(f"\n\n📊 Registered Users:")
    for user in users:
        print(f"  User #{user.id}: {user.username} (role: {user.role})")
        
        # Count cameras owned by this user
        owned_cameras_count = db.query(models.Camera).filter(
            models.Camera.admin_user_id == user.id
        ).count()
        print(f"    Owns {owned_cameras_count} camera(s)")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
