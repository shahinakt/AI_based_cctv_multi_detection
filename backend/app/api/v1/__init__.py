"""
backend/app/api/v1/__init__.py - COMPLETE VERSION
Properly integrates all routers including camera_status
"""
from fastapi import APIRouter

print("🔍 Loading API v1 routers...")

from . import (
    auth,
    users,
    cameras,
    camera_status,  # NEW: Camera status updates from AI worker
    evidence,
    notifications,
    stream_handler
)

print("✅ Basic routers loaded")

# Import incidents with detailed error handling
try:
    print("🔍 Importing incidents module...")
    from . import incidents_simple as incidents
    print("✅ Using simple incidents module for dashboard")
    INCIDENTS_LOADED = True
except Exception as e:
    print(f"❌ Failed to import incidents module: {e}")
    print(f"❌ Import error type: {type(e)}")
    import traceback
    traceback.print_exc()
    INCIDENTS_LOADED = False

# Create API v1 router
api_v1_router = APIRouter(prefix="/api/v1")
print("✅ Created API v1 router")

# Camera status endpoints: included under /api/v1/cameras
print("🔍 Including camera status router...")
api_v1_router.include_router(
    camera_status.router,
    prefix="/cameras",
    tags=["camera_status"],
)
print("✅ Camera status router included")

# Auth endpoints: /api/v1/auth/...
print("🔍 Including auth router...")
api_v1_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["auth"]
)
print("✅ Auth router included")

# User endpoints: /api/v1/users/...
print("🔍 Including users router...")
api_v1_router.include_router(
    users.router,
    prefix="/users",
    tags=["users"]
)
print("✅ Users router included")

# Camera endpoints: /api/v1/cameras/...
print("🔍 Including cameras router...")
api_v1_router.include_router(
    cameras.router,
    prefix="/cameras",
    tags=["cameras"]
)
print("✅ Cameras router included")

# Incidents endpoints: /api/v1/incidents/...
if INCIDENTS_LOADED:
    try:
        print("🔍 Including incidents router...")
        print(f"📋 Incidents router object: {incidents.router}")
        print(f"📋 Incidents router routes: {[r.path for r in incidents.router.routes]}")
        
        api_v1_router.include_router(
            incidents.router,
            prefix="/incidents",
            tags=["incidents"]
        )
        print("✅ Incidents router included successfully!")
        
        # Verify it was added
        all_routes = [r.path for r in api_v1_router.routes]
        incident_routes = [r for r in all_routes if 'incident' in r.lower()]
        print(f"📊 Found incident routes: {incident_routes}")
        
    except Exception as e:
        print(f"❌ Error including incidents router: {e}")
        import traceback
        traceback.print_exc()
else:
    print("❌ Incidents not loaded - creating fallback router")
    
    # Create minimal fallback
    fallback_router = APIRouter()
    
    @fallback_router.get("/")
    def get_incidents_fallback():
        return {"incidents": [], "error": "Incidents module failed to load"}
    
    @fallback_router.get("/test")
    def test_incidents_fallback():
        return {"message": "Fallback incidents endpoint"}
    
    api_v1_router.include_router(
        fallback_router,
        prefix="/incidents",
        tags=["incidents_fallback"]
    )
    print("⚠️ Fallback incidents router included")

# Evidence endpoints: /api/v1/evidence/...
api_v1_router.include_router(
    evidence.router,
    prefix="/evidence",
    tags=["evidence"]
)

# Notifications endpoints: /api/v1/notifications/...
api_v1_router.include_router(
    notifications.router,
    prefix="/notifications",
    tags=["notifications"]
)

# Stream processing endpoints: /api/v1/stream/...
print("🔍 Including stream handler router...")
api_v1_router.include_router(
    stream_handler.router,
    prefix="/stream",
    tags=["stream"]
)
print("✅ Stream handler router included")

# Camera status endpoints: /api/v1/cameras/{camera_id}/status
# Note: This is included in app/__init__.py separately to avoid prefix conflicts
# The camera_status router has endpoints like PUT /api/v1/cameras/{camera_id}/status

# Debug: Print all registered routes
print("📊 All registered API v1 routes:")
for i, route in enumerate(api_v1_router.routes, 1):
    print(f"   {i}. {route.path} - {getattr(route, 'methods', ['N/A'])}")

print("✅ API v1 router setup complete!")

__all__ = ["api_v1_router"]