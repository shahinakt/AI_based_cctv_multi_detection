"""
Script to create a security user
"""
from app.database import SessionLocal
from app import crud, schemas, models
from app.core.security import get_password_hash

db = SessionLocal()

# Check if security user already exists
security_user = db.query(models.User).filter(
    models.User.email == "security@test.com"
).first()

if security_user:
    print(f"✅ Security user already exists: {security_user.username} ({security_user.email})")
else:
    # Create security user
    user_data = schemas.UserCreate(
        username="Security Officer",
        email="security@test.com",
        password="security123",
        role="security"
    )
    
    new_user = models.User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        role=models.RoleEnum.security,
        is_active=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    print(f"✅ Created security user:")
    print(f"   Username: {new_user.username}")
    print(f"   Email: {new_user.email}")
    print(f"   Password: security123")
    print(f"   Role: {new_user.role}")
    print(f"\n🔐 Login credentials:")
    print(f"   Email: security@test.com")
    print(f"   Password: security123")

db.close()
