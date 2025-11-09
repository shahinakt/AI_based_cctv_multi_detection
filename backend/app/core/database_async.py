"""
Async Database Layer - NEW FILE
Provides non-blocking database operations
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from .config import settings

# Convert sync URL to async (postgresql:// → postgresql+asyncpg://)
async_db_url = settings.DB_URL.replace('postgresql://', 'postgresql+asyncpg://')

# Create async engine
async_engine = create_async_engine(
    async_db_url,
    echo=False,
    poolclass=NullPool,  # No connection pool for async
    future=True
)

# Create async session maker
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def get_async_db() -> AsyncSession:
    """
    Dependency for async database sessions
    
    Usage:
        @router.get("/")
        async def endpoint(db: AsyncSession = Depends(get_async_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()