from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .config import settings
from ..models import Base

engine = create_engine(settings.DB_URL, pool_pre_ping=True, echo=False)  # Set echo=True for dev logs

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# For Alembic target
Base.metadata.bind = engine