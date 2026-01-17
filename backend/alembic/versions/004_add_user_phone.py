"""add phone field to users

Revision ID: 004_add_user_phone
Revises: 003_add_camera_status
Create Date: 2026-01-11

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004_add_user_phone'
down_revision = '003_add_camera_status'
branch_labels = None
depends_on = None


def upgrade():
    # Add phone column to users table
    op.add_column('users', sa.Column('phone', sa.String(), nullable=True))


def downgrade():
    # Remove phone column from users table
    op.drop_column('users', 'phone')
