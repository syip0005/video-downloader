from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="VD_", extra="ignore")

    download_dir: Path = Path("./downloads")
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]
    max_concurrent_downloads: int = 3

    # Permissive single-user limits.
    max_filesize_bytes: int = 8 * 1024 * 1024 * 1024  # 8 GiB
    max_duration_seconds: int = 6 * 60 * 60  # 6 hours

    # Completed/failed jobs older than this are evicted; their files unlinked.
    job_ttl_seconds: int = 60 * 60 * 6
    cleanup_interval_seconds: int = 15 * 60

    log_level: str = "INFO"

    # Path to the built Vite frontend (the `dist/` directory). When set and
    # the directory exists, FastAPI serves it as the SPA at the root path.
    # Leave None in development — the Vite dev server handles the frontend.
    frontend_dist: Path | None = None


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.download_dir.mkdir(parents=True, exist_ok=True)
    return settings
