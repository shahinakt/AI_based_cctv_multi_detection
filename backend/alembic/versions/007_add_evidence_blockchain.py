"""Add evidence_blockchain table for tamper-proof integrity verification

Revision ID: 007_add_evidence_blockchain
Revises: add_evidence_security
Create Date: 2026-03-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '008_evidence_blockchain'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # Create the enum type for blockchain verification status
    blockchain_status_enum = sa.Enum(
        'Pending', 'Verified', 'Rejected',
        name='blockchain_verification_status_enum'
    )
    blockchain_status_enum.create(op.get_bind(), checkfirst=True)

    if 'evidence_blockchain' not in existing_tables:
        op.create_table(
            'evidence_blockchain',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('incident_id', sa.Integer(), nullable=False),
            sa.Column('evidence_path', sa.String(), nullable=False),
            sa.Column('evidence_hash', sa.String(256), nullable=False),
            sa.Column('blockchain_hash', sa.String(256), nullable=False),
            sa.Column(
                'verification_status',
                postgresql.ENUM('Pending', 'Verified', 'Rejected',
                        name='blockchain_verification_status_enum',
                        create_type=False),
                nullable=False,
                server_default='Pending',
            ),
            sa.Column('verified_by_admin', sa.Integer(), nullable=True),
            sa.Column('verification_date', sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                'created_at',
                sa.DateTime(timezone=True),
                server_default=sa.text('CURRENT_TIMESTAMP'),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ),
            sa.ForeignKeyConstraint(['verified_by_admin'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('incident_id', name='uq_evidence_blockchain_incident_id'),
        )
        op.create_index(
            op.f('ix_evidence_blockchain_id'),
            'evidence_blockchain', ['id'], unique=False
        )
        op.create_index(
            op.f('ix_evidence_blockchain_incident_id'),
            'evidence_blockchain', ['incident_id'], unique=True
        )


def downgrade():
    op.drop_index(
        op.f('ix_evidence_blockchain_incident_id'), table_name='evidence_blockchain'
    )
    op.drop_index(
        op.f('ix_evidence_blockchain_id'), table_name='evidence_blockchain'
    )
    op.drop_table('evidence_blockchain')
    sa.Enum(name='blockchain_verification_status_enum').drop(
        op.get_bind(), checkfirst=True
    )
