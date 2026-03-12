"""Create logs table placeholder

Revision ID: 006
Revises: 005
Create Date: 2026-02-10 00:00:00.000000

Note: Audit log table is fully created in migration 007.
This migration is a no-op placeholder that preserves the revision chain.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op: audit_logs table is created in the next migration (007)
    pass


def downgrade() -> None:
    pass
