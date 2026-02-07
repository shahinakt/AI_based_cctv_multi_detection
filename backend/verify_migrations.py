#!/usr/bin/env python
"""Verify migration chain integrity"""
import os
import re

migrations_dir = os.path.join(os.path.dirname(__file__), 'alembic', 'versions')

# Read all migration files
migrations = {}
for filename in sorted(os.listdir(migrations_dir)):
    if filename.endswith('.py') and not filename.startswith('__'):
        filepath = os.path.join(migrations_dir, filename)
        with open(filepath, 'r') as f:
            content = f.read()
            
        # Extract revision and down_revision
        rev_match = re.search(r"revision\s*=\s*['\"]([^'\"]+)['\"]", content)
        down_match = re.search(r"down_revision\s*=\s*['\"]([^'\"]+)['\"]", content)
        
        if rev_match:
            revision = rev_match.group(1)
            down_revision = down_match.group(1) if down_match else None
            migrations[revision] = {
                'file': filename,
                'down_revision': down_revision
            }

print("Migration Chain:")
print("=" * 60)

# Start from None (initial)
current = None
chain = []

while True:
    # Find migration that revises current
    found = None
    for rev, data in migrations.items():
        if data['down_revision'] == current:
            found = rev
            break
    
    if not found:
        break
    
    chain.append(found)
    print(f"{current or 'None':>10} -> {found:<10} ({migrations[found]['file']})")
    current = found

print("=" * 60)
print(f"\nTotal migrations: {len(migrations)}")
print(f"Chain length: {len(chain)}")

if len(chain) == len(migrations):
    print("✓ All migrations are in the chain!")
else:
    print("✗ Missing migrations:")
    for rev, data in migrations.items():
        if rev not in chain:
            print(f"  - {rev} ({data['file']}) - down_revision: {data['down_revision']}")
