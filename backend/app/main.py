
import uvicorn
from . import app
from .core.config import settings



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