import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from . import app
from .core.database import engine, SessionLocal
from .core.config import settings
from sqlalchemy import text

@asynccontextmanager
async def lifespan(app_: FastAPI):
    # Startup: Test DB connection
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        print("DB connection successful")
    except Exception as e:
        print(f"DB connection failed: {e}")
    yield
    # Shutdown: Close DB
    db.close()

app.router.lifespan_context = lifespan

if __name__ == "__main__":
    # Dev: Create tables (use Alembic in prod)
    # from .core.database import Base
    # Base.metadata.create_all(bind=engine)
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info"
    )