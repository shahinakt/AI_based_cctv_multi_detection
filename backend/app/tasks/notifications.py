import firebase_admin
from firebase_admin import credentials, messaging
from .celery_app import celery_app
from sqlalchemy.orm import Session
from ..core.database import SessionLocal
from .. import crud, models
from ..core.config import settings
from ..schemas import IncidentOut
from ..api.v1.websocket import manager  # For broadcasting
from datetime import datetime

# Init FCM if key provided
if settings.FCM_SERVER_KEY:
    try:
        cred = credentials.Certificate(settings.FCM_SERVER_KEY)  # Assumes JSON path; or legacy key
        firebase_admin.initialize_app(cred)
    except Exception as e:
        print(f"FCM init failed: {e}")  # Graceful, skip pushes

@celery_app.task(bind=True, max_retries=3, queue="notifications")
def send_incident_notifications(self, incident_id: int):
    db = SessionLocal()
    try:
        incident = crud.get_incident(db, incident_id)
        if not incident:
            return {"status": "Incident not found"}

        # Get security users (for pushes)
        security_users = db.query(models.User).filter(
            models.User.role == models.RoleEnum.security,
            models.User.is_active == True
        ).all()

        sent_count = 0
        for user in security_users:
            # Create notification entry
            notification = models.Notification(
                incident_id=incident.id,
                user_id=user.id,
                type="fcm"
            )
            db.add(notification)

            # Get device tokens
            tokens = [token.token for token in user.device_tokens if token.platform in ["android", "ios"]]

            if tokens and settings.FCM_SERVER_KEY:
                # Send FCM push
                message = messaging.MulticastMessage(
                    notification=messaging.Notification(
                        title="CCTV Incident Alert",
                        body=f"{incident.description or 'New incident detected'} (Severity: {incident.severity.value})"
                    ),
                    data={
                        "incident_id": str(incident.id),
                        "type": incident.type.value,
                        "severity": incident.severity.value
                    },
                    tokens=tokens
                )
                response = messaging.send_multicast(message)
                sent_count += len(response.successful_tokens)
                print(f"FCM sent to {len(response.successful_tokens)} tokens for user {user.id}")

            # If no tokens or FCM fail, log as sent (for DB)
            db.commit()

        # Broadcast to WebSocket connected clients (security/viewer)
        manager.broadcast(IncidentOut.from_orm(incident))

        # Placeholder for escalation: If unacknowledged after 5min, re-send (use Celery beat periodic task)
        # escalate_unacknowledged.delay(incident.id)  # Define separate task

        return {"status": "success", "sent_to": len(security_users), "fcm_success": sent_count}
    except Exception as exc:
        print(f"Notification task failed: {exc}")
        try:
            self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
        except self.max_retries:
            print("Max retries exceeded for notifications")
        finally:
            db.close()


@celery_app.task(bind=True, max_retries=3, queue="notifications")
def send_incident_notifications_to_users(self, incident_id: int, user_ids: list):
    db = SessionLocal()
    try:
        incident = crud.get_incident(db, incident_id)
        if not incident:
            return {"status": "Incident not found"}

        sent_count = 0
        for uid in user_ids:
            user = crud.get_user(db, uid)
            if not user or not user.is_active:
                continue

            # Create notification entry
            notification = models.Notification(
                incident_id=incident.id,
                user_id=user.id,
                type="fcm"
            )
            db.add(notification)

            tokens = [token.token for token in user.device_tokens if token.platform in ["android", "ios"]]
            if tokens and settings.FCM_SERVER_KEY:
                message = messaging.MulticastMessage(
                    notification=messaging.Notification(
                        title="CCTV Incident Alert",
                        body=f"{incident.description or 'New incident detected'} (Severity: {incident.severity.value})"
                    ),
                    data={
                        "incident_id": str(incident.id),
                        "type": incident.type.value,
                        "severity": incident.severity.value
                    },
                    tokens=tokens
                )
                response = messaging.send_multicast(message)
                sent_count += len(response.successful_tokens)
                print(f"FCM sent to {len(response.successful_tokens)} tokens for user {user.id}")

            db.commit()

        # Optionally broadcast via websocket
        manager.broadcast(IncidentOut.from_orm(incident))

        return {"status": "success", "sent_to": len(user_ids), "fcm_success": sent_count}
    except Exception as exc:
        print(f"Notification to users task failed: {exc}")
        try:
            self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
        except self.max_retries:
            print("Max retries exceeded for notifications_to_users")
        finally:
            db.close()

# Placeholder escalation task (run periodically via beat)
@celery_app.task(queue="notifications")
def escalate_unacknowledged(incident_id: int):
    # Re-run send if still unacknowledged
    pass  # Implement query + re-send logic

# In backend/app/tasks/notifications.py
def determine_escalation_level(incident):
    if incident['severity'] == 'critical':
        # Send to ALL security + admin
        # SMS + Push notification + Email
        # Auto-call emergency services (optional)
        return 'immediate'
    
    elif incident['severity'] == 'high':
        # Send to security team
        # Push notification + Email
        return 'urgent'
    
    elif incident['severity'] == 'medium':
        # Send to assigned personnel
        # Push notification only
        return 'standard'
    
    else:  # low
        # Log only, no immediate notification
        return 'informational'