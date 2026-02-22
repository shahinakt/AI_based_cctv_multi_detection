"""Add evidence_shares and audit_logs tables for ultra protection

Revision ID: 007
Revises: 005
Create Date: 2026-02-17 00:00:00.000000

This migration adds:
1. evidence_shares table - Admin-to-security delegation system
2. audit_logs table - Immutable audit trail for legal compliance
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '007'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    # Create evidence_shares table
    op.create_table(
        'evidence_shares',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('evidence_id', sa.Integer(), nullable=False),
        sa.Column('shared_with_user_id', sa.Integer(), nullable=False),
        sa.Column('shared_by_admin_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['evidence_id'], ['evidence.id'], ),
        sa.ForeignKeyConstraint(['shared_by_admin_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['shared_with_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_evidence_shares_evidence_id'), 'evidence_shares', ['evidence_id'], unique=False)
    op.create_index(op.f('ix_evidence_shares_shared_with_user_id'), 'evidence_shares', ['shared_with_user_id'], unique=False)
    
    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('evidence_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['evidence_id'], ['evidence.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_evidence_id'), 'audit_logs', ['evidence_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_timestamp'), 'audit_logs', ['timestamp'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)


def downgrade():
    # Drop audit_logs table
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_timestamp'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_evidence_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_table('audit_logs')
    
    # Drop evidence_shares table
    op.drop_index(op.f('ix_evidence_shares_shared_with_user_id'), table_name='evidence_shares')
    op.drop_index(op.f('ix_evidence_shares_evidence_id'), table_name='evidence_shares')
    op.drop_table('evidence_shares')
