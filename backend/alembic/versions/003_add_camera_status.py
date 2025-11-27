"""
backend/alembic/versions/003_add_camera_status.py
Add camera_status table for real-time streaming tracking

Revision ID: 003
Revises: 002
Create Date: 2024-01-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create camera_status table
    op.create_table(
        'camera_status',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('camera_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='inactive', nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('fps', sa.Float(), server_default='0.0', nullable=True),
        sa.Column('last_frame_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_frames', sa.Integer(), server_default='0', nullable=True),
        sa.Column('total_incidents', sa.Integer(), server_default='0', nullable=True),
        sa.Column('processing_device', sa.String(length=20), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('camera_id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_camera_status_id'), 'camera_status', ['id'], unique=False)
    op.create_index(op.f('ix_camera_status_camera_id'), 'camera_status', ['camera_id'], unique=False)
    op.create_index(op.f('ix_camera_status_status'), 'camera_status', ['status'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_camera_status_status'), table_name='camera_status')
    op.drop_index(op.f('ix_camera_status_camera_id'), table_name='camera_status')
    op.drop_index(op.f('ix_camera_status_id'), table_name='camera_status')
    
    # Drop table
    op.drop_table('camera_status')