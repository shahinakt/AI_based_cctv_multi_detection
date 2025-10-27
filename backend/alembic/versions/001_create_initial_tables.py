"""Create initial tables

Revision ID: 001
Revises: 
Create Date: 2023-11-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Enums
    role_enum = postgresql.ENUM('admin', 'security', 'viewer', name='role_enum')
    role_enum.create(op.get_bind())
    incident_type_enum = postgresql.ENUM('abuse_violence', 'theft', 'fall_health', 'accident_car_theft', name='incident_type_enum')
    incident_type_enum.create(op.get_bind())
    severity_enum = postgresql.ENUM('low', 'medium', 'high', 'critical', name='severity_enum')
    severity_enum.create(op.get_bind())

    # Table: users
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('role', sa.Enum('admin', 'security', 'viewer', name='role_enum'), nullable=False, server_default='viewer'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('username')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=False)

    # Table: sensitivity_settings
    op.create_table('sensitivity_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('camera_id', sa.Integer(), nullable=False),
        sa.Column('confidence_threshold', sa.Float(precision=2), nullable=True, server_default='0.5'),
        sa.Column('persistence_frames', sa.Integer(), nullable=True, server_default='5'),
        sa.Column('cooldown_seconds', sa.Integer(), nullable=True, server_default='30'),
        sa.Column('severity_multiplier', sa.Float(precision=2), nullable=True, server_default='1.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('camera_id')
    )

    # Table: cameras
    op.create_table('cameras',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('rtsp_url', sa.String(length=500), nullable=False),
        sa.Column('location', sa.String(length=255), nullable=True),
        sa.Column('admin_user_id', sa.Integer(), nullable=True),
        sa.Column('sensitivity_settings_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['admin_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['sensitivity_settings_id'], ['sensitivity_settings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cameras_id'), 'cameras', ['id'], unique=False)

    # Table: incidents
    op.create_table('incidents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('camera_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('abuse_violence', 'theft', 'fall_health', 'accident_car_theft', name='incident_type_enum'), nullable=False),
        sa.Column('severity', sa.Enum('low', 'medium', 'high', 'critical', name='severity_enum'), nullable=False),
        sa.Column('severity_score', sa.Float(precision=3), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('assigned_user_id', sa.Integer(), nullable=True),
        sa.Column('acknowledged', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('blockchain_tx', sa.String(length=66), nullable=True),
        sa.ForeignKeyConstraint(['assigned_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_incidents_camera_id'), 'incidents', ['camera_id'], unique=False)
    op.create_index(op.f('ix_incidents_id'), 'incidents', ['id'], unique=False)
    op.create_index(op.f('ix_incidents_severity'), 'incidents', ['severity'], unique=False)
    op.create_index(op.f('ix_incidents_timestamp'), 'incidents', ['timestamp'], unique=False)
    op.create_index(op.f('ix_incidents_type'), 'incidents', ['type'], unique=False)

    # Table: evidence
    op.create_table('evidence',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('incident_id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('sha256_hash', sa.String(length=64), nullable=False),
        sa.Column('file_type', sa.String(length=10), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('uploaded_to_ipfs', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_evidence_id'), 'evidence', ['id'], unique=False)
    op.create_index(op.f('ix_evidence_incident_id'), 'evidence', ['incident_id'], unique=False)

    # Table: notifications
    op.create_table('notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('incident_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('device_token_id', sa.Integer(), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('type', sa.String(length=20), nullable=False, server_default='fcm'),
        sa.ForeignKeyConstraint(['device_token_id'], ['device_tokens.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)
    op.create_index(op.f('ix_notifications_incident_id'), 'notifications', ['incident_id'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)

    # Table: device_tokens
    op.create_table('device_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=255), nullable=False),
        sa.Column('platform', sa.String(length=10), nullable=False, server_default='android'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_device_tokens_id'), 'device_tokens', ['id'], unique=False)
    op.create_index(op.f('ix_device_tokens_user_id'), 'device_tokens', ['user_id'], unique=False)

    # Table: detection_logs
    op.create_table('detection_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('camera_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=True),
        sa.Column('confidence', sa.Float(precision=3), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_detection_logs_camera_id'), 'detection_logs', ['camera_id'], unique=False)
    op.create_index(op.f('ix_detection_logs_id'), 'detection_logs', ['id'], unique=False)
    op.create_index(op.f('ix_detection_logs_timestamp'), 'detection_logs', ['timestamp'], unique=False)

    # Table: model_versions
    op.create_table('model_versions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('version', sa.String(length=20), nullable=False),
        sa.Column('path', sa.String(length=500), nullable=False),
        sa.Column('metrics', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_model_versions_id'), 'model_versions', ['id'], unique=False)
    op.create_index(op.f('ix_model_versions_name'), 'model_versions', ['name'], unique=False)

def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index(op.f('ix_model_versions_name'), table_name='model_versions')
    op.drop_index(op.f('ix_model_versions_id'), table_name='model_versions')
    op.drop_table('model_versions')

    op.drop_index(op.f('ix_detection_logs_timestamp'), table_name='detection_logs')
    op.drop_index(op.f('ix_detection_logs_id'), table_name='detection_logs')
    op.drop_index(op.f('ix_detection_logs_camera_id'), table_name='detection_logs')
    op.drop_table('detection_logs')

    op.drop_index(op.f('ix_device_tokens_user_id'), table_name='device_tokens')
    op.drop_index(op.f('ix_device_tokens_id'), table_name='device_tokens')
    op.drop_table('device_tokens')

    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_incident_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_id'), table_name='notifications')
    op.drop_table('notifications')

    op.drop_index(op.f('ix_evidence_incident_id'), table_name='evidence')
    op.drop_index(op.f('ix_evidence_id'), table_name='evidence')
    op.drop_table('evidence')

    op.drop_index(op.f('ix_incidents_type'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_timestamp'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_severity'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_id'), table_name='incidents')
    op.drop_index(op.f('ix_incidents_camera_id'), table_name='incidents')
    op.drop_table('incidents')

    op.drop_index(op.f('ix_cameras_id'), table_name='cameras')
    op.drop_table('cameras')

    op.drop_table('sensitivity_settings')

    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS role_enum CASCADE')
    op.execute('DROP TYPE IF EXISTS incident_type_enum CASCADE')
    op.execute('DROP TYPE IF EXISTS severity_enum CASCADE')