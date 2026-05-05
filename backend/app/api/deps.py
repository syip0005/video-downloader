from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.services.job_manager import JobManager

SettingsDep = Annotated[Settings, Depends(get_settings)]


@lru_cache
def _job_manager_singleton(max_concurrent: int, download_dir_str: str) -> JobManager:
    from pathlib import Path

    return JobManager(max_concurrent=max_concurrent, download_dir=Path(download_dir_str))


def get_job_manager(settings: SettingsDep) -> JobManager:
    return _job_manager_singleton(settings.max_concurrent_downloads, str(settings.download_dir))


JobManagerDep = Annotated[JobManager, Depends(get_job_manager)]
