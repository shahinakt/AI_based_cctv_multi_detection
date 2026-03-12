"""
backend/app/tasks/sos.py

Celery task: delayed SOS check.

This task is scheduled at incident creation time with countdown=60.
It is an additional safety net on top of the threading.Timer in sos_service.py —
whichever fires first (i.e. Celery if Redis is available, threading.Timer otherwise)
will perform the SOS check.  The check is idempotent, so double-triggering is safe.
"""
import logging
from datetime import datetime, timezone

from .celery_app import celery_app
from ..core.database import SessionLocal
from .. import models

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    max_retries=0,             # Do not retry – one-shot
    queue="notifications",
    name="app.tasks.sos.check_and_trigger_sos",
)
def check_and_trigger_sos(self, incident_id: int) -> dict:
    """
    Celery task: check acknowledgement 60 seconds after a high-priority incident
    was created and trigger SOS if still unacknowledged.

    This is fire-and-forget (max_retries=0) — idempotent with DB unique constraint.
    """
    from ..services.sos_service import _create_sos_alert, _HIGH_SEVERITY, _notify_admins_websocket

    db = SessionLocal()
    try:
        incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()

        if not incident:
            return {"status": "skipped", "reason": f"incident {incident_id} not found"}

        if incident.acknowledged:
            logger.info("[SOSTask] Incident %d acknowledged – no SOS needed.", incident_id)
            return {"status": "skipped", "reason": "acknowledged"}

        if incident.sos_triggered:
            logger.info("[SOSTask] SOS already triggered for incident %d.", incident_id)
            return {"status": "skipped", "reason": "already_triggered"}

        if incident.severity not in _HIGH_SEVERITY:
            return {"status": "skipped", "reason": "not_high_priority"}

        sos = _create_sos_alert(db, incident)
        _notify_admins_websocket(incident_id, sos.id)

        logger.warning("[SOSTask] 🚨 SOS triggered via Celery for incident %d.", incident_id)
        return {"status": "triggered", "sos_id": sos.id}

    except Exception as exc:
        logger.error("[SOSTask] Error for incident %d: %s", incident_id, exc)
        db.rollback()
        return {"status": "error", "detail": str(exc)}
    finally:
        db.close()
