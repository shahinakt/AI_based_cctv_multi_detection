import pydantic

# pydantic v2 moved BaseSettings to the `pydantic-settings` package.
# Detect pydantic major version and import BaseSettings accordingly.
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
from typing import Optional, List

class Settings(BaseSettings):
    # Database
    DB_URL: str = Field(..., env="DATABASE_URL")

    # Security
    SECRET_KEY: str = Field(..., env="JWT_SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Celery/Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")

    # FCM
    FCM_SERVER_KEY: Optional[str] = Field(None, env="FCM_SERVER_KEY")

    # Blockchain
    WEB3_RPC_URL: str = Field(default="http://localhost:8545", env="WEB3_RPC_URL")  # Hardhat local
    CONTRACT_ADDRESS: Optional[str] = Field(None, env="EVIDENCE_REGISTRY_ADDRESS")

    # Origins
    FRONTEND_URL: str = Field(default="http://localhost:3000", env="FRONTEND_URL")
    MOBILE_URL: List[str] = Field(default=["http://localhost:19006"], env="MOBILE_URL")

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()