#!/usr/bin/env python
"""Check current alembic revision in database"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import engine
from sqlalchemy import text

try:
    with engine.connect() as conn:
        # Check if alembic_version table exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'alembic_version'
            );
        """))
        
        table_exists = result.scalar()
        
        if table_exists:
            # Get current version
            result = conn.execute(text("SELECT version_num FROM alembic_version"))
            current_version = result.scalar()
            print(f"Current database revision: {current_version}")
        else:
            print("No alembic_version table found - database not initialized")
            
        # Check if verification_status_enum already exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM pg_type 
                WHERE typname = 'verification_status_enum'
            );
        """))
        
        enum_exists = result.scalar()
        print(f"verification_status_enum exists: {enum_exists}")
        
        # Check evidence table columns
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'evidence'
            ORDER BY ordinal_position;
        """))
        
        columns = [row[0] for row in result]
        print(f"\nEvidence table columns: {columns}")
        
        # Check if blockchain columns exist
        blockchain_cols = ['blockchain_tx_hash', 'blockchain_hash', 'verification_status', 'verified_at']
        existing_blockchain_cols = [col for col in blockchain_cols if col in columns]
        
        if existing_blockchain_cols:
            print(f"\n⚠️  Blockchain columns already exist: {existing_blockchain_cols}")
            print("Migration 005 may need to be skipped or modified")
        else:
            print("\n✓ Blockchain columns do not exist yet - safe to migrate")
            
except Exception as e:
    print(f"Error checking database: {e}")
    import traceback
    traceback.print_exc()
