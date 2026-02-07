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
    # Create verification status enum - only if it doesn't exist
    verification_status_enum = postgresql.ENUM('PENDING', 'VERIFIED', 'TAMPERED', name='verification_status_enum')
    verification_status_enum.create(op.get_bind(), checkfirst=True)
    
    # Add blockchain verification columns to evidence table
    op.add_column('evidence', sa.Column('blockchain_tx_hash', sa.String(), nullable=True))
    op.add_column('evidence', sa.Column('verification_status', 
                                        sa.Enum('PENDING', 'VERIFIED', 'TAMPERED', name='verification_status_enum'), 
                                        nullable=False, 
                                        server_default='PENDING'))
    op.add_column('evidence', sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('evidence', sa.Column('blockchain_hash', sa.String(), nullable=True))
    
    # Create index on blockchain_tx_hash for faster lookups
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
