"""Add emergency_contact_1 and emergency_contact_2 to users table

Revision ID: 011_add_emergency_contacts
Revises: 010_add_user_full_name
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa

revision = '011_add_emergency_contacts'
down_revision = '010_add_user_full_name'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [c["name"] for c in inspector.get_columns("users")]

    if "emergency_contact_1" not in existing_columns:
        op.add_column("users", sa.Column("emergency_contact_1", sa.String(15), nullable=True))
    if "emergency_contact_2" not in existing_columns:
        op.add_column("users", sa.Column("emergency_contact_2", sa.String(15), nullable=True))


def downgrade():
    op.drop_column("users", "emergency_contact_2")
    op.drop_column("users", "emergency_contact_1")
