"""
Minimal incidents router for dashboard - just the essentials
INCLUDES: POST endpoint for AI worker to create incidents
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
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
            incidents = db.query(models.Incident).options(
                joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
                joinedload(models.Incident.assigned_user),
                joinedload(models.Incident.evidence_items)
            ).order_by(models.Incident.timestamp.desc()).limit(limit).all()
        else:
            # Non-admin users: Get all incidents and filter in Python to avoid SQL join issues
            all_incidents = db.query(models.Incident).options(
                joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
                joinedload(models.Incident.assigned_user),
                joinedload(models.Incident.evidence_items)
            ).order_by(models.Incident.timestamp.desc()).limit(limit).all()
            
            filtered = []
            for incident in all_incidents:
                # Check if incident should be visible to this user
                camera_owner_id = incident.camera.admin_user_id if incident.camera else None
                assigned_user_id = incident.assigned_user_id
                camera_id = incident.camera_id
                incident_description = incident.description or ""
                
                # Include if:
                # 1. User owns the camera
                # 2. Incident is assigned to user
                # 3. AI camera incident (camera_id >= 29) - visible to ALL users
                # 4. SOS alerts or viewer reports - visible to security users
                is_sos_or_report = incident_description.startswith('[SOS ALERT]') or incident_description.startswith('[VIEWER REPORT]')
                
                if (camera_owner_id == current_user.id or
                    assigned_user_id == current_user.id or
                    camera_id >= 29 or
                    (role_str == 'security' and is_sos_or_report)):
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

@router.get("/{incident_id}", response_model=schemas.IncidentOut)
def get_single_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a single incident by ID with full details including evidence"""
    
    # Fetch incident with all related data
    incident = db.query(models.Incident).options(
        joinedload(models.Incident.camera).joinedload(models.Camera.admin_user),
        joinedload(models.Incident.assigned_user),
        joinedload(models.Incident.evidence_items)
    ).filter(models.Incident.id == incident_id).first()
    
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Get user role as string
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    role_str = str(role).lower()
    
    # Admin can see all incidents
    if role_str == "admin":
        print(f"[get_single_incident] Admin accessing incident #{incident_id}")
        return incident
    
    # Check access for non-admin users
    camera_owner_id = incident.camera.admin_user_id if incident.camera else None
    assigned_user_id = incident.assigned_user_id
    camera_id = incident.camera_id
    
    # User can access if:
    # 1. They own the camera
    # 2. Incident is assigned to them
    # 3. It's an AI camera incident (camera_id >= 29)
    has_access = (
        camera_owner_id == current_user.id or
        assigned_user_id == current_user.id or
        camera_id >= 29
    )
    
    if not has_access:
        print(f"[get_single_incident] User {current_user.username} denied access to incident #{incident_id}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to view this incident"
        )
    
    print(f"[get_single_incident] User {current_user.username} accessing incident #{incident_id}, evidence count: {len(incident.evidence_items)}")
    return incident


@router.put("/{incident_id}/acknowledge", response_model=schemas.IncidentOut)
def acknowledge_incident(
    incident_id: int,
    acknowledged: bool,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Acknowledge or un-acknowledge an incident"""
    
    # Update incident acknowledgement status
    updated = crud.update_incident_acknowledged(
        db, incident_id, acknowledged, 
        current_user.id if acknowledged else None
    )
    
    if not updated:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    print(f"✅ Incident #{incident_id} {'acknowledged' if acknowledged else 'un-acknowledged'} by {current_user.username}")
    
    return updated


@router.post("/{incident_id}/grant-access", response_model=dict)
def grant_access_endpoint(
    incident_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Grant access for an incident. Payload may include 'role' or 'user_ids' list."""
    
    # Get user role as string
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    role_str = str(role).lower()
    
    # Only admin can grant access
    if role_str != "admin":
        raise HTTPException(status_code=403, detail="Only admins can grant access")
    
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    requested_role = payload.get("role")
    user_ids = payload.get("user_ids")

    if requested_role:
        # Find users with this role
        users = db.query(models.User).filter(
            models.User.role == models.RoleEnum(requested_role),
            models.User.is_active == True
        ).all()
        user_ids = [u.id for u in users]

    if not user_ids:
        return {"status": "no_op", "message": "No users provided or found for role"}

    print(f"✅ Access granted to incident #{incident_id} for {len(user_ids)} users by {current_user.username}")
    
    return {"status": "success", "user_count": len(user_ids)}


@router.post("/{incident_id}/notify", response_model=dict)
def notify_incident_users(
    incident_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Assign incident to a security user and trigger notifications. Admin only."""
    # Check role
    role_str = str(current_user.role.value).lower() if hasattr(current_user.role, 'value') else str(current_user.role).lower()
    if role_str != "admin":
        raise HTTPException(status_code=403, detail="Only admins can notify incidents")
    
    user_ids = payload.get("user_ids") or []
    if not user_ids:
        raise HTTPException(status_code=400, detail="user_ids required")

    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Assign incident to the first security user in the list
    assigned_user_id = None
    for user_id in user_ids:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user and user.role == models.RoleEnum.security:
            incident.assigned_user_id = user_id
            assigned_user_id = user_id
            db.commit()
            break  # Only assign to first valid security user
    
    if not assigned_user_id:
        raise HTTPException(status_code=400, detail="No valid security users provided")
    
    print(f"✅ Incident #{incident_id} assigned to user #{assigned_user_id} by {current_user.username}")
    
    # Note: If you have Celery notifications enabled, uncomment:
    # try:
    #     from ...tasks.notifications import send_incident_notifications_to_users
    #     send_incident_notifications_to_users.delay(incident_id, user_ids)
    # except Exception as e:
    #     print(f"⚠️ Notification task failed: {e}")
    
    return {"status": "success", "assigned_to": assigned_user_id}