"""
backend/app/api/v1/sos.py

SOS Alert API
=============
Endpoints for managing SOS alerts triggered by unacknowledged high-priority
incidents.

Routes (all mounted under /api/v1/sos  in __init__.py):

  GET  /                          – Admin/Security: list all SOS alerts (paginated)
  GET  /active                    – Admin/Security: list only active (unhandled) SOS alerts
  GET  /status/{incident_id}      – Any auth'd user: check SOS status for an incident
  PATCH /{sos_id}/handle          – Admin/Security: mark an SOS alert as handled
  GET  /stats                     – Admin: summary counts

Acknowledge endpoint lives in incidents_simple.py:
  POST /api/v1/incidents/acknowledge/{incident_id}
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ... import crud, schemas, models
from ...core.database import get_db
from ...dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _require_admin(current_user: models.User) -> models.User:
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


def _require_admin_or_security(current_user: models.User) -> models.User:
    """Allow both admin and security roles to view SOS alerts."""
    if current_user.role not in (models.RoleEnum.admin, models.RoleEnum.security):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or security access required.",
        )
    return current_user


# ---------------------------------------------------------------------------
# GET /sos/  – Admin: List all SOS alerts
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=List[schemas.SosAlertOut],
    summary="Admin: List all SOS alerts",
)
def list_sos_alerts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    alert_status: Optional[str] = Query(None, description="Filter: 'active' or 'handled'"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin_or_security(current_user)
    return crud.get_all_sos_alerts(db, skip=skip, limit=limit, status_filter=alert_status)


# ---------------------------------------------------------------------------
# GET /sos/active  – Admin: List active (unhandled) SOS alerts
# ---------------------------------------------------------------------------

@router.get(
    "/active",
    response_model=List[schemas.SosAlertOut],
    summary="Admin: List active (unhandled) SOS alerts",
)
def list_active_sos_alerts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin_or_security(current_user)
    return crud.get_all_sos_alerts(db, skip=skip, limit=limit, status_filter="active")


# ---------------------------------------------------------------------------
# GET /sos/stats  – Admin: summary counts
# ---------------------------------------------------------------------------

@router.get(
    "/stats",
    summary="Admin: SOS alert summary statistics",
)
def get_sos_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    active = crud.get_active_sos_count(db)
    total = len(crud.get_all_sos_alerts(db, skip=0, limit=100000))
    handled = total - active
    return {
        "total": total,
        "active": active,
        "handled": handled,
    }


# ---------------------------------------------------------------------------
# GET /sos/status/{incident_id}  – Any auth'd user: check SOS state
# ---------------------------------------------------------------------------

@router.get(
    "/status/{incident_id}",
    response_model=schemas.SosStatusResponse,
    summary="Check SOS status for an incident (any role)",
)
def get_sos_status(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident {incident_id} not found.",
        )

    sos = crud.get_sos_alert_by_incident(db, incident_id)

    # Calculate approximate time remaining from the SOS service timer dict
    time_remaining: Optional[int] = None
    try:
        from ...services.sos_service import _pending_timers, SOS_TIMEOUT_SECONDS
        timer = _pending_timers.get(incident_id)
        if timer and not timer.finished.is_set():
            # threading.Timer stores _interval and the start time is not exposed;
            # estimate from incident creation timestamp instead
            from datetime import timezone as _tz
            created = incident.timestamp
            if created.tzinfo is None:
                created = created.replace(tzinfo=_tz.utc)
            elapsed = (datetime.now(_tz.utc) - created).total_seconds()
            remaining = int(SOS_TIMEOUT_SECONDS - elapsed)
            time_remaining = max(0, remaining)
    except Exception:
        pass

    incident_status_val = (
        incident.incident_status.value
        if hasattr(incident.incident_status, "value")
        else str(incident.incident_status)
    ) if incident.incident_status else "Pending"

    return schemas.SosStatusResponse(
        incident_id=incident_id,
        sos_triggered=bool(incident.sos_triggered),
        sos_alert=sos,
        incident_status=incident_status_val,
        acknowledged=bool(incident.acknowledged),
        time_remaining_seconds=time_remaining,
    )


# ---------------------------------------------------------------------------
# PATCH /sos/{sos_id}/handle  – Admin or Security: mark SOS as handled
# ---------------------------------------------------------------------------

@router.patch(
    "/{sos_id}/handle",
    response_model=schemas.SosAlertOut,
    summary="Admin or Security: Mark an SOS alert as handled",
)
def handle_sos_alert(
    sos_id: int,
    body: schemas.SosHandleRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin_or_security(current_user)

    sos = crud.get_sos_alert(db, sos_id)
    if not sos:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SOS alert {sos_id} not found.",
        )

    if sos.alert_status == "handled":
        return sos  # Idempotent

    sos.alert_status = "handled"
    sos.handled_by_admin = current_user.id
    sos.handled_at = datetime.now(timezone.utc)

    if body.resolution_note:
        sos.alert_message = (sos.alert_message or "") + f"\n[Resolution] {body.resolution_note}"

    # Also update the parent incident status to Resolved
    incident = db.query(models.Incident).filter(models.Incident.id == sos.incident_id).first()
    if incident and incident.incident_status == models.IncidentStatusEnum.SosTriggered:
        incident.incident_status = models.IncidentStatusEnum.Resolved

    db.commit()
    db.refresh(sos)

    logger.info(
        "[SOS API] User %d (%s) handled SOS alert %d for incident %d",
        current_user.id, current_user.role, sos_id, sos.incident_id,
    )
    return sos
