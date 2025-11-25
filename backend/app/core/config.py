import pydantic

pv = tuple(int(x) for x in pydantic.__version__.split(".")[:2])
if pv[0] >= 2:
    try:
        from pydantic_settings import BaseSettings
    except Exception as e:
        raise RuntimeError(
            "pydantic v2 detected but `pydantic-settings` is not installed. "
            "Install it (pip install pydantic-settings) or pin pydantic<2."
        ) from e
    from pydantic import Field
else:
    from pydantic import BaseSettings, Field

from typing import Optional


class Settings(BaseSettings):
    # Database
    # Primary DB URL used by the application
    # 👇 match your .env key: DB_URL=...
    DB_URL: Optional[str] = Field(None, env="DB_URL")
    SQLALCHEMY_DATABASE_URL: Optional[str] = Field(None, env="SQLALCHEMY_DATABASE_URL")

    # Security
    # 👇 match your .env key: SECRET_KEY=...
    SECRET_KEY: str = Field(..., env="SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Celery/Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")

    # FCM
    FCM_SERVER_KEY: Optional[str] = Field(None, env="FCM_SERVER_KEY")

    # Blockchain
    WEB3_RPC_URL: str = Field(default="http://localhost:8545", env="WEB3_RPC_URL")
    CONTRACT_ADDRESS: Optional[str] = Field(None, env="EVIDENCE_REGISTRY_ADDRESS")

    # Origins
    # 👇 comma-separated string, we will split later
    FRONTEND_URL: str = Field(default="http://localhost:3000", env="FRONTEND_URL")

    # 👇 simple string, not a list; we’ll handle list-like behavior ourselves
    MOBILE_URL: Optional[str] = Field(default=None, env="MOBILE_URL")

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# Backwards-compat: if only `SQLALCHEMY_DATABASE_URL` is provided, use it.
if not settings.DB_URL and settings.SQLALCHEMY_DATABASE_URL:
    db_val = settings.SQLALCHEMY_DATABASE_URL
    if isinstance(db_val, str) and "psycopg2" in db_val:
        db_val = db_val.replace("psycopg2", "asyncpg")
    settings.DB_URL = db_val
