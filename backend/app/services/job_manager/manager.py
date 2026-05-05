from pathlib import Path

from app.schemas import DownloadFormat
from app.services.job_manager.job import Job


class JobManager:
    """In-memory job registry. Owns concurrency control and background dispatch.

    All public methods are async so callers can `await` uniformly. The in-memory
    implementation is non-blocking; swap for Redis/RQ when moving to multi-worker.
    """

    def __init__(self, *, max_concurrent: int, download_dir: Path) -> None:
        self._max_concurrent = max_concurrent
        self._download_dir = download_dir

    async def enqueue(self, url: str, fmt: DownloadFormat) -> Job:
        raise NotImplementedError

    async def get(self, job_id: str) -> Job | None:
        raise NotImplementedError

    async def list(self) -> list[Job]:
        raise NotImplementedError

    async def file_path(self, job_id: str) -> Path | None:
        raise NotImplementedError
