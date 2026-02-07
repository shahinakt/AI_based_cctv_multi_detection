"""
Minimal incidents router for dashboard - just the essentials
INCLUDES: POST endpoint for AI worker to create incidents
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ... import models, schemas, crud
from ...core.database import get_db
from ...dependencies import get_current_user

# Create router
router = APIRouter()

@router.post("/", response_model=schemas.IncidentOut)
def create_incident(
    incident: schemas.IncidentCreate,
    db: Session = Depends(get_db)
    # No auth for AI worker
):
    """Create a new incident (used by AI worker and viewer reports)"""
    # For viewer reports, auto-create a default camera if none exists
    is_viewer_report = incident.description and incident.description.startswith('[VIEWER REPORT]')
    
    camera = db.query(models.Camera).filter(models.Camera.id == incident.camera_id).first()
    if not camera:
        if is_viewer_report:
            # Auto-create a default "Manual Reports" camera for viewer submissions
            print(f"[INFO] Auto-creating default camera for viewer report")
            default_camera = models.Camera(
                id=incident.camera_id,
                name="Manual Reports (Viewer Submissions)",
                stream_url="manual",
                location="N/A - User Reported",
                is_active=True,
                admin_user_id=None  # No admin needed for manual reports
            )
            db.add(default_camera)
            try:
                db.commit()
                db.refresh(default_camera)
                print(f"[INFO] Created default camera with ID {default_camera.id}")
            except Exception as e:
                db.rollback()
                print(f"[WARNING] Could not create default camera: {e}")
                any_camera = db.query(models.Camera).first()
                if any_camera:
                    incident.camera_id = any_camera.id
                    print(f"[INFO] Using existing camera ID {any_camera.id} instead")
                else:
                    raise HTTPException(
                        status_code=500,
                        detail="No cameras available. Please contact administrator."
                    )
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Camera with id {incident.camera_id} not found. Please create a camera first."
            )
    
    created_incident = crud.create_incident(db, incident=incident)
    
    print(f"✅ Incident created: ID={created_incident.id}, Type={created_incident.type}, Camera={created_incident.camera_id}")
    
    return created_incident

@router.get("/", response_model=List[schemas.IncidentOut])
def get_incidents_for_dashboard(
    limit: int = 10000,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get incidents for dashboard count - minimal version"""
    
    try:
        # Get user role as string
        role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        role_str = str(role).lower()
        
        # Admin sees all incidents
        if role_str == "admin":
            incidents = db.query(models.Incident).order_by(models.Incident.timestamp.desc()).limit(limit).all()
        else:
            # Non-admin users: Get all incidents and filter in Python to avoid SQL join issues
            all_incidents = db.query(models.Incident).order_by(models.Incident.timestamp.desc()).limit(limit).all()
            
            filtered = []
            for incident in all_incidents:
                # Check if incident should be visible to this user
                camera_owner_id = incident.camera.admin_user_id if incident.camera else None
                assigned_user_id = incident.assigned_user_id
                camera_id = incident.camera_id
                
                # Include if:
                # 1. User owns the camera
                # 2. Incident is assigned to user
                # 3. AI camera incident (camera_id >= 29) - visible to ALL users
                if (camera_owner_id == current_user.id or
                    assigned_user_id == current_user.id or
                    camera_id >= 29):
                    filtered.append(incident)
            
            incidents = filtered
            print(f"[incidents_simple] User {current_user.username} (role: {role_str}) sees {len(incidents)} incidents")
        
        return incidents
        
    except Exception as e:
        print(f"Error loading incidents: {e}")
        import traceback
        traceback.print_exc()
        # Return empty list instead of error to not break dashboard
        return []

@router.get("/count")
def get_incidents_count(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get just the count for dashboard"""
    
    try:
        # Get user role as string
        role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        role_str = str(role).lower()
        
        if role_str == "admin":
            total = db.query(models.Incident).count()
            open_count = db.query(models.Incident).filter(models.Incident.acknowledged == False).count()
        else:
            # Get all incidents and filter in Python
            all_incidents = db.query(models.Incident).all()
            
            filtered_total = 0
            filtered_open = 0
            
            for incident in all_incidents:
                camera_owner_id = incident.camera.admin_user_id if incident.camera else None
                assigned_user_id = incident.assigned_user_id
                camera_id = incident.camera_id
                
                # Check if visible to user
                is_visible = (camera_owner_id == current_user.id or
                            assigned_user_id == current_user.id or
                            camera_id >= 29)
                
                if is_visible:
                    filtered_total += 1
                    if not incident.acknowledged:
                        filtered_open += 1
            
            total = filtered_total
            open_count = filtered_open
        
        return {"total": total, "open": open_count}
        
    except Exception as e:
        print(f"Error getting incident count: {e}")
        import traceback
        traceback.print_exc()
        return {"total": 0, "open": 0}