from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="VD_", extra="ignore")

    download_dir: Path = Path("./downloads")
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]
    max_concurrent_downloads: int = 3
    job_ttl_seconds: int = 60 * 60 * 6


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.download_dir.mkdir(parents=True, exist_ok=True)
    return settings
