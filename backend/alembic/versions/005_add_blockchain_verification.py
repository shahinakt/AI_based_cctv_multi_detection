"""Add blockchain verification fields to evidence

Revision ID: 005
Revises: 004
Create Date: 2026-02-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Create verification status enum - only if it doesn't exist
    verification_status_enum = postgresql.ENUM('PENDING', 'VERIFIED', 'TAMPERED', name='verification_status_enum')
    verification_status_enum.create(op.get_bind(), checkfirst=True)

    existing_cols = [c['name'] for c in inspector.get_columns('evidence')]

    # Add blockchain verification columns to evidence table (skip if already present)
    if 'blockchain_tx_hash' not in existing_cols:
        op.add_column('evidence', sa.Column('blockchain_tx_hash', sa.String(), nullable=True))
    if 'verification_status' not in existing_cols:
        op.add_column('evidence', sa.Column(
            'verification_status',
            postgresql.ENUM('PENDING', 'VERIFIED', 'TAMPERED',
                            name='verification_status_enum', create_type=False),
            nullable=False,
            server_default='PENDING'))
    if 'verified_at' not in existing_cols:
        op.add_column('evidence', sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))
    if 'blockchain_hash' not in existing_cols:
        op.add_column('evidence', sa.Column('blockchain_hash', sa.String(), nullable=True))

    # Create index on blockchain_tx_hash for faster lookups
    existing_indexes = [i['name'] for i in inspector.get_indexes('evidence')]
    if 'ix_evidence_blockchain_tx_hash' not in existing_indexes:
        op.create_index(op.f('ix_evidence_blockchain_tx_hash'), 'evidence', ['blockchain_tx_hash'], unique=False)

def downgrade() -> None:
    # Drop columns
    op.drop_index(op.f('ix_evidence_blockchain_tx_hash'), table_name='evidence')
    op.drop_column('evidence', 'blockchain_hash')
    op.drop_column('evidence', 'verified_at')
    op.drop_column('evidence', 'verification_status')
    op.drop_column('evidence', 'blockchain_tx_hash')
    
    # Drop enum
    verification_status_enum = postgresql.ENUM('PENDING', 'VERIFIED', 'TAMPERED', name='verification_status_enum')
    verification_status_enum.drop(op.get_bind())
