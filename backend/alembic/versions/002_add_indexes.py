"""Add performance indexes

Revision ID: 002
Revises: 001
Create Date: 2023-11-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Composite index for incidents: camera + timestamp (for time-range queries per camera)
    op.create_index('ix_incidents_camera_timestamp', 'incidents', ['camera_id', 'timestamp'], 
                    postgresql_using='btree', postgresql_ops={'timestamp': 'DESC'})

    # Composite index for detection_logs: camera + timestamp (for log history per camera)
    op.create_index('ix_detection_logs_camera_timestamp', 'detection_logs', ['camera_id', 'timestamp'], 
                    postgresql_using='btree', postgresql_ops={'timestamp': 'DESC'})

    # Composite index for notifications: user + sent_at (for paginated user notifications)
    op.create_index('ix_notifications_user_sent', 'notifications', ['user_id', 'sent_at'], 
                    postgresql_using='btree', postgresql_ops={'sent_at': 'DESC'})

    # Unique index for model_versions: name + version (prevent duplicates)
    op.create_index('ix_model_versions_unique', 'model_versions', ['name', 'version'], unique=True)

def downgrade() -> None:
    # Drop indexes in reverse order
    op.drop_index('ix_model_versions_unique', table_name='model_versions')
    op.drop_index('ix_notifications_user_sent', table_name='notifications')
    op.drop_index('ix_detection_logs_camera_timestamp', table_name='detection_logs')
    op.drop_index('ix_incidents_camera_timestamp', table_name='incidents')