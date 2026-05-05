from dataclasses import dataclass, field
from time import time

from app.schemas import DownloadFormat
from app.services.job_manager.status import JobStatus


@dataclass
class Job:
    id: str
    url: str
    format: DownloadFormat
    status: JobStatus = JobStatus.QUEUED
    progress: float = 0.0
    title: str | None = None
    thumbnail: str | None = None
    filename: str | None = None
    filesize: int | None = None
    error: str | None = None
    created_at: float = field(default_factory=time)
    updated_at: float = field(default_factory=time)
