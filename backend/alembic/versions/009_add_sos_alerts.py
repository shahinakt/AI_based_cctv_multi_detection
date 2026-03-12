"""Add SOS alert table and SOS fields to incidents

Revision ID: 009_add_sos_alerts
Revises: 008_evidence_blockchain
Create Date: 2026-03-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '009_add_sos_alerts'
down_revision = '008_evidence_blockchain'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # ------------------------------------------------------------------ #
    # 1. Create incident_status_enum PostgreSQL type                      #
    # ------------------------------------------------------------------ #
    incident_status_enum = sa.Enum(
        'Pending', 'Acknowledged', 'SosTriggered', 'Resolved',
        name='incident_status_enum',
    )
    incident_status_enum.create(op.get_bind(), checkfirst=True)

    # ------------------------------------------------------------------ #
    # 2. Add new columns to the incidents table (skip if already present) #
    # ------------------------------------------------------------------ #
    existing_incident_cols = [c['name'] for c in inspector.get_columns('incidents')]

    if 'incident_status' not in existing_incident_cols:
        op.add_column(
            'incidents',
            sa.Column(
                'incident_status',
                postgresql.ENUM('Pending', 'Acknowledged', 'SosTriggered', 'Resolved',
                        name='incident_status_enum',
                        create_type=False),
                nullable=False,
                server_default='Pending',
            ),
        )
    if 'sos_triggered' not in existing_incident_cols:
        op.add_column(
            'incidents',
            sa.Column('sos_triggered', sa.Boolean(), nullable=False, server_default='false'),
        )
    if 'acknowledged_at' not in existing_incident_cols:
        op.add_column(
            'incidents',
            sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        )

    # ------------------------------------------------------------------ #
    # 3. Create the sos_alerts table                                      #
    # ------------------------------------------------------------------ #
    if 'sos_alerts' not in existing_tables:
        op.create_table(
            'sos_alerts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('incident_id', sa.Integer(), nullable=False),
            sa.Column('alert_status', sa.String(20), nullable=False, server_default='active'),
            sa.Column('alert_message', sa.Text(), nullable=True),
            sa.Column(
                'triggered_at',
                sa.DateTime(timezone=True),
                server_default=sa.text('CURRENT_TIMESTAMP'),
                nullable=False,
            ),
            sa.Column('handled_by_admin', sa.Integer(), nullable=True),
            sa.Column('handled_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['incident_id'], ['incidents.id']),
            sa.ForeignKeyConstraint(['handled_by_admin'], ['users.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('incident_id', name='uq_sos_alerts_incident_id'),
        )
    existing_sos_indexes = [i['name'] for i in inspector.get_indexes('sos_alerts')] if 'sos_alerts' in existing_tables else []
    if 'ix_sos_alerts_id' not in existing_sos_indexes:
        op.create_index(op.f('ix_sos_alerts_id'), 'sos_alerts', ['id'], unique=False)
    if 'ix_sos_alerts_incident_id' not in existing_sos_indexes:
        op.create_index(op.f('ix_sos_alerts_incident_id'), 'sos_alerts', ['incident_id'], unique=True)
    if 'ix_sos_alerts_alert_status' not in existing_sos_indexes:
        op.create_index(op.f('ix_sos_alerts_alert_status'), 'sos_alerts', ['alert_status'], unique=False)
    if 'ix_sos_alerts_triggered_at' not in existing_sos_indexes:
        op.create_index(op.f('ix_sos_alerts_triggered_at'), 'sos_alerts', ['triggered_at'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_sos_alerts_triggered_at'), table_name='sos_alerts')
    op.drop_index(op.f('ix_sos_alerts_alert_status'), table_name='sos_alerts')
    op.drop_index(op.f('ix_sos_alerts_incident_id'), table_name='sos_alerts')
    op.drop_index(op.f('ix_sos_alerts_id'), table_name='sos_alerts')
    op.drop_table('sos_alerts')

    op.drop_column('incidents', 'acknowledged_at')
    op.drop_column('incidents', 'sos_triggered')
    op.drop_column('incidents', 'incident_status')

    sa.Enum(name='incident_status_enum').drop(op.get_bind(), checkfirst=True)
