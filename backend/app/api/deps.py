from typing import Annotated

from fastapi import Depends, Request

from app.core.config import Settings, get_settings
from app.services.job_manager import JobManager

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_job_manager(request: Request) -> JobManager:
    return request.app.state.job_manager  # type: ignore[no-any-return]


JobManagerDep = Annotated[JobManager, Depends(get_job_manager)]
