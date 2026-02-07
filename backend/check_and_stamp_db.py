#!/usr/bin/env python
"""Check database state and stamp to correct version"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import engine
from sqlalchemy import text, inspect

def check_database_state():
    """Check which tables and columns exist"""
    inspector = inspect(engine)
    
    print("=== DATABASE STATE CHECK ===\n")
    
    # Check if alembic_version exists
    tables = inspector.get_table_names()
    print(f"Tables in database: {len(tables)}")
    print(f"Tables: {', '.join(tables)}\n")
    
    has_alembic = 'alembic_version' in tables
    print(f"Alembic version table exists: {has_alembic}")
    
    if has_alembic:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version_num FROM alembic_version"))
            version = result.scalar()
            print(f"Current migration version: {version}\n")
    else:
        print("No alembic_version table - database not stamped\n")
    
    # Check evidence table structure
    if 'evidence' in tables:
        evidence_cols = [col['name'] for col in inspector.get_columns('evidence')]
        print(f"Evidence table columns ({len(evidence_cols)}):")
        for col in evidence_cols:
            print(f"  - {col}")
        
        # Check for blockchain columns
        blockchain_cols = ['blockchain_tx_hash', 'blockchain_hash', 'verification_status', 'verified_at']
        existing_blockchain = [col for col in blockchain_cols if col in evidence_cols]
        missing_blockchain = [col for col in blockchain_cols if col not in evidence_cols]
        
        print(f"\nBlockchain columns status:")
        if existing_blockchain:
            print(f"  ✓ Existing: {', '.join(existing_blockchain)}")
        if missing_blockchain:
            print(f"  ✗ Missing: {', '.join(missing_blockchain)}")
            print(f"\n  → Need to apply migration 005")
        else:
            print(f"  ✓ All blockchain columns present")
    
    # Check users table for phone column
    if 'users' in tables:
        users_cols = [col['name'] for col in inspector.get_columns('users')]
        has_phone = 'phone' in users_cols
        print(f"\nUsers table has 'phone' column: {has_phone}")
        if not has_phone:
            print("  → Need to apply migration 004")
    
    # Recommend action
    print("\n=== RECOMMENDED ACTION ===")
    if not has_alembic:
        if 'users' in tables and 'evidence' in tables:
            # Database exists but not stamped
            if 'phone' in [col['name'] for col in inspector.get_columns('users')]:
                if all(col in [c['name'] for c in inspector.get_columns('evidence')] 
                       for col in blockchain_cols):
                    print("Database appears fully migrated. Run:")
                    print("  alembic stamp 005")
                else:
                    print("Database has migration 004 applied. Run:")
                    print("  alembic stamp 004")
                    print("  alembic upgrade head")
            else:
                print("Database has migrations 001-003 applied. Run:")
                print("  alembic stamp 003")
                print("  alembic upgrade head")
        else:
            print("Database is empty. Safe to run:")
            print("  alembic upgrade head")
    else:
        print("Database is already stamped. Run:")
        print("  alembic upgrade head")

if __name__ == "__main__":
    try:
        check_database_state()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
