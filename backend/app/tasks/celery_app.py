import logging
from celery import Celery
from ..core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Redis availability probe
# ---------------------------------------------------------------------------

def _redis_is_available(url: str) -> bool:
    """Return True if Redis is reachable at *url*, False otherwise."""
    try:
        import redis as _redis
        client = _redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
        client.ping()
        client.close()
        return True
    except Exception:
        return False


_redis_up = _redis_is_available(settings.REDIS_URL)

if _redis_up:
    _broker  = settings.REDIS_URL
    _backend = settings.REDIS_URL
    logger.info("✅ Redis is available – Celery will use Redis broker (%s)", settings.REDIS_URL)
else:
    # Fall back to an in-process memory transport.
    # task_always_eager=True means every .delay() / .apply_async() call
    # runs the task synchronously in the same process, so no worker or
    # broker is needed at all.
    _broker  = "memory://"
    _backend = "cache+memory://"
    logger.warning(
        "⚠️  Redis not reachable at %s – Celery falling back to in-memory "
        "eager mode (tasks run synchronously, no worker needed).",
        settings.REDIS_URL,
    )

celery_app = Celery(
    "ai_cctv_system",
    broker=_broker,
    backend=_backend,
    include=[
        "app.tasks.blockchain",
        "app.tasks.notifications",
        "app.tasks.sos",
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
        "app.tasks.sos.check_and_trigger_sos": {"queue": "notifications"},
    },
    worker_prefetch_multiplier=1,  # For sequential processing
    task_acks_late=True,
    # When Redis is absent, run every task inline so the API still works.
    task_always_eager=not _redis_up,
    task_eager_propagates=not _redis_up,
)

# Optional: Task signal for logging
# from celery.signals import task_prerun, task_postrun
# @task_prerun.connect
# def on_task_init(sender=None, task_id=None, task=None, **kwargs):
#     print(f"Task {task.name} started: {task_id}")