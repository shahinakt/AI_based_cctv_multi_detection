from celery import Celery
from ..core.config import settings

celery_app = Celery(
    "ai_cctv_system",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.blockchain",
        "app.tasks.notifications",
    ],
)

# Celery config
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.tasks.blockchain.register_blockchain_evidence": {"queue": "blockchain"},
        "app.tasks.notifications.send_incident_notifications": {"queue": "notifications"},
    },
    worker_prefetch_multiplier=1,  # For sequential processing
    task_acks_late=True,
)

# Optional: Task signal for logging
# from celery.signals import task_prerun, task_postrun
# @task_prerun.connect
# def on_task_init(sender=None, task_id=None, task=None, **kwargs):
#     print(f"Task {task.name} started: {task_id}")