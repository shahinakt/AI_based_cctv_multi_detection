#!/usr/bin/env python
"""Check incidents, cameras, and user relationships in the database"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app import models
from sqlalchemy.orm import joinedload

def check_incident_relationships():
    db = SessionLocal()
    try:
        print("\n" + "="*80)
        print("INCIDENT-CAMERA-USER RELATIONSHIP DIAGNOSTIC")
        print("="*80)
        
        # Get all users
        users = db.query(models.User).all()
        print(f"\n📊 Total Users: {len(users)}")
        for user in users:
            print(f"  - User #{user.id}: {user.username} (role: {user.role})")
        
        # Get all cameras
        cameras = db.query(models.Camera).all()
        print(f"\n📊 Total Cameras: {len(cameras)}")
        for camera in cameras:
            owner = camera.admin_user
            owner_info = f"{owner.username} (#{owner.id})" if owner else "No Owner"
            print(f"  - Camera #{camera.id}: {camera.name}")
            print(f"    Owner: {owner_info}")
            print(f"    admin_user_id: {camera.admin_user_id}")
        
        # Get all incidents
        incidents = db.query(models.Incident).options(
            joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
            joinedload(models.Incident.assigned_user)
        ).all()
        
        print(f"\n📊 Total Incidents: {len(incidents)}")
        for incident in incidents:
            print(f"\n  Incident #{incident.id}:")
            print(f"    Type: {incident.type}")
            print(f"    Camera ID: {incident.camera_id}")
            if incident.camera:
                owner = incident.camera.admin_user
                owner_info = f"{owner.username} (#{owner.id})" if owner else "No Owner (None)"
                print(f"    Camera: {incident.camera.name}")
                print(f"    Camera Owner (admin_user_id): {incident.camera.admin_user_id}")
                print(f"    Camera Owner: {owner_info}")
            else:
                print(f"    Camera: NOT FOUND")
            
            if incident.assigned_user_id:
                print(f"    Assigned to: {incident.assigned_user.username} (#{incident.assigned_user_id})")
            else:
                print(f"    Assigned to: None")
            print(f"    Timestamp: {incident.timestamp}")
        
        # Check which users should see which incidents
        print("\n" + "="*80)
        print("USER ACCESS ANALYSIS")
        print("="*80)
        
        for user in users:
            print(f"\n👤 User: {user.username} (#{user.id}, role: {user.role})")
            
            # Find cameras owned by this user
            owned_cameras = db.query(models.Camera).filter(
                models.Camera.admin_user_id == user.id
            ).all()
            print(f"   Owns {len(owned_cameras)} camera(s): {[f'#{c.id}' for c in owned_cameras]}")
            
            # Find incidents from owned cameras
            incidents_from_owned_cameras = db.query(models.Incident).join(
                models.Camera
            ).filter(
                models.Camera.admin_user_id == user.id
            ).all()
            
            # Find incidents assigned to user
            assigned_incidents = db.query(models.Incident).filter(
                models.Incident.assigned_user_id == user.id
            ).all()
            
            # Find AI camera incidents (camera_id >= 29)
            ai_incidents = db.query(models.Incident).filter(
                models.Incident.camera_id >= 29
            ).all()
            
            print(f"   Should see {len(incidents_from_owned_cameras)} incidents from owned cameras")
            print(f"   Should see {len(assigned_incidents)} assigned incidents")
            print(f"   Should see {len(ai_incidents)} AI camera incidents (camera_id >= 29)")
            
            # Calculate total unique incidents
            all_incident_ids = set()
            all_incident_ids.update([i.id for i in incidents_from_owned_cameras])
            all_incident_ids.update([i.id for i in assigned_incidents])
            all_incident_ids.update([i.id for i in ai_incidents])
            
            if user.role == 'admin':
                total = len(incidents)
                print(f"   ✅ Total visible incidents (Admin sees all): {total}")
            else:
                total = len(all_incident_ids)
                print(f"   ✅ Total visible incidents: {total}")
                if total > 0:
                    print(f"      Incident IDs: {sorted(all_incident_ids)}")
        
        # Check for orphaned incidents (incidents without valid cameras)
        print("\n" + "="*80)
        print("ORPHANED INCIDENTS CHECK")
        print("="*80)
        
        orphaned = db.query(models.Incident).filter(
            ~models.Incident.camera_id.in_(
                db.query(models.Camera.id)
            )
        ).all()
        
        if orphaned:
            print(f"\n⚠️  Found {len(orphaned)} orphaned incidents (camera doesn't exist):")
            for incident in orphaned:
                print(f"   Incident #{incident.id}: camera_id={incident.camera_id} (MISSING)")
        else:
            print("\n✅ No orphaned incidents found")
        
        # Check for incidents with NULL camera ownership
        print("\n" + "="*80)
        print("INCIDENTS WITH NO CAMERA OWNER")
        print("="*80)
        
        no_owner_incidents = db.query(models.Incident).join(
            models.Camera
        ).filter(
            models.Camera.admin_user_id.is_(None)
        ).all()
        
        if no_owner_incidents:
            print(f"\n⚠️  Found {len(no_owner_incidents)} incidents from cameras with no owner:")
            for incident in no_owner_incidents:
                print(f"   Incident #{incident.id}: Camera #{incident.camera_id} ({incident.camera.name}) has admin_user_id=NULL")
                print(f"      Type: {incident.type}")
                print(f"      Timestamp: {incident.timestamp}")
        else:
            print("\n✅ All cameras have owners")
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_incident_relationships()
