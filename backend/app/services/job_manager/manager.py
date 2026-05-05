from pathlib import Path

from app.schemas import DownloadFormat
from app.services.job_manager.job import Job


class JobManager:
    """In-memory job registry. Owns concurrency control and background dispatch.

    Replace the in-memory dict with Redis/RQ when moving to multi-worker deployments.
    """

    def __init__(self, *, max_concurrent: int, download_dir: Path) -> None:
        self._max_concurrent = max_concurrent
        self._download_dir = download_dir

    def enqueue(self, url: str, fmt: DownloadFormat) -> Job:
        raise NotImplementedError

    def get(self, job_id: str) -> Job | None:
        raise NotImplementedError

    def list(self) -> list[Job]:
        raise NotImplementedError

    def file_path(self, job_id: str) -> Path | None:
        raise NotImplementedError
