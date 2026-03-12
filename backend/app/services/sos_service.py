"""
backend/app/services/sos_service.py

SOS Alert Timer Service
=======================
When a high-priority incident (severity = high or critical) is created and
the user does NOT acknowledge it within SOS_TIMEOUT_SECONDS (default 60),
this service automatically:

  1. Creates a SosAlert record in the database.
  2. Updates the Incident: sos_triggered = True, incident_status = SosTriggered.
  3. Notifies all admins via the existing WebSocket broadcast channel.

Implementation uses Python's threading.Timer so it works from both sync
FastAPI route handlers and Celery tasks without requiring the asyncio
event loop.

A module-level dict  _pending_timers  tracks active timers so they can be
cancelled immediately when the user acknowledges the incident.
"""
import logging
import threading
from datetime import datetime, timezone
from typing import Dict

from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from .. import models

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SOS_TIMEOUT_SECONDS: int = 60          # seconds before SOS fires
_HIGH_SEVERITY = {models.SeverityEnum.high, models.SeverityEnum.critical}

# incident_id → threading.Timer
_pending_timers: Dict[int, threading.Timer] = {}
_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Internal: SOS trigger logic
# ---------------------------------------------------------------------------

def _create_sos_alert(db: Session, incident: models.Incident) -> models.SosAlert:
    """Insert a SosAlert record (idempotent – returns existing if already present)."""
    existing = (
        db.query(models.SosAlert)
        .filter(models.SosAlert.incident_id == incident.id)
        .first()
    )
    if existing:
        logger.info("[SOSService] SOS record already exists for incident %d", incident.id)
        return existing

    alert = models.SosAlert(
        incident_id=incident.id,
        alert_status="active",
        alert_message=(
            f"SOS AUTO-TRIGGERED: High-priority incident #{incident.id} "
            f"({incident.type.value if hasattr(incident.type, 'value') else incident.type} / "
            f"severity {incident.severity.value if hasattr(incident.severity, 'value') else incident.severity}) "
            f"was not acknowledged within {SOS_TIMEOUT_SECONDS} seconds."
        ),
        triggered_at=datetime.now(timezone.utc),
    )
    db.add(alert)

    # Update incident flags
    incident.sos_triggered = True
    incident.incident_status = models.IncidentStatusEnum.SosTriggered

    db.commit()
    db.refresh(alert)
    db.refresh(incident)

    logger.warning(
        "[SOSService] 🚨 SOS triggered for incident %d (severity=%s)",
        incident.id,
        incident.severity.value if hasattr(incident.severity, 'value') else incident.severity,
    )
    return alert


def _notify_admins_websocket(incident_id: int, sos_alert_id: int) -> None:
    """Best-effort WebSocket broadcast to all connected clients."""
    try:
        from ..api.v1.websocket import manager
        import asyncio
        import json

        payload = json.dumps({
            "event": "SOS_TRIGGERED",
            "incident_id": incident_id,
            "sos_alert_id": sos_alert_id,
            "message": f"🚨 SOS Alert: Incident #{incident_id} not acknowledged within {SOS_TIMEOUT_SECONDS}s",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Always create a fresh event loop for this daemon thread –
        # threading.Timer callbacks run in a plain thread with no loop.
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(manager.broadcast(payload))
        finally:
            loop.close()

    except Exception as ws_err:
        logger.debug("[SOSService] WS broadcast skipped: %s", ws_err)


def _timer_callback(incident_id: int) -> None:
    """
    Called by threading.Timer after SOS_TIMEOUT_SECONDS.
    Opens its own DB session, checks acknowledgement, and fires SOS if needed.
    """
    with _lock:
        _pending_timers.pop(incident_id, None)

    db: Session = SessionLocal()
    try:
        incident = (
            db.query(models.Incident)
            .filter(models.Incident.id == incident_id)
            .first()
        )
        if not incident:
            logger.warning("[SOSService] Incident %d not found during SOS check.", incident_id)
            return

        if incident.acknowledged:
            logger.info("[SOSService] Incident %d already acknowledged – no SOS.", incident_id)
            return

        if incident.sos_triggered:
            logger.info("[SOSService] SOS already triggered for incident %d.", incident_id)
            return

        if incident.severity not in _HIGH_SEVERITY:
            logger.info(
                "[SOSService] Incident %d severity=%s is not high-priority – skipping SOS.",
                incident_id,
                incident.severity,
            )
            return

        # --- Fire SOS ---
        sos = _create_sos_alert(db, incident)
        _notify_admins_websocket(incident_id, sos.id)

    except Exception as exc:
        logger.error("[SOSService] Error in SOS timer callback for incident %d: %s", incident_id, exc)
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_high_priority(severity: models.SeverityEnum) -> bool:
    """Return True if the severity level qualifies as high-priority for SOS."""
    return severity in _HIGH_SEVERITY


def schedule_sos_timer(incident_id: int) -> None:
    """
    Start a 60-second countdown for the given incident.
    If the incident is already tracked, this is a no-op (idempotent).
    """
    with _lock:
        if incident_id in _pending_timers:
            logger.debug("[SOSService] Timer already scheduled for incident %d.", incident_id)
            return

        timer = threading.Timer(SOS_TIMEOUT_SECONDS, _timer_callback, args=(incident_id,))
        timer.daemon = True   # Don't block server shutdown
        timer.name = f"sos-timer-{incident_id}"
        timer.start()
        _pending_timers[incident_id] = timer

    logger.info(
        "[SOSService] ⏱ SOS timer started for incident %d (%ds countdown).",
        incident_id, SOS_TIMEOUT_SECONDS,
    )


def cancel_sos_timer(incident_id: int) -> bool:
    """
    Cancel the pending SOS timer for the given incident (called on acknowledgement).
    Returns True if a timer was cancelled, False if none was found.
    """
    with _lock:
        timer = _pending_timers.pop(incident_id, None)

    if timer and not timer.finished.is_set():
        timer.cancel()
        logger.info("[SOSService] ✅ SOS timer cancelled for incident %d.", incident_id)
        return True

    logger.debug("[SOSService] No active timer to cancel for incident %d.", incident_id)
    return False


def get_pending_incident_ids() -> list:
    """Return a snapshot list of incident IDs with active SOS timers."""
    with _lock:
        return list(_pending_timers.keys())
