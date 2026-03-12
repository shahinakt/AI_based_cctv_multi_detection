"""Add full_name field to users table

Revision ID: 010_add_user_full_name
Revises: 009_add_sos_alerts
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '010_add_user_full_name'
down_revision = '009_add_sos_alerts'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [c["name"] for c in inspector.get_columns("users")]

    if "full_name" not in existing_columns:
        op.add_column("users", sa.Column("full_name", sa.String(100), nullable=True))


def downgrade():
    op.drop_column("users", "full_name")
