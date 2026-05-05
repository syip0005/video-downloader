import asyncio
import time
import uuid
from pathlib import Path

from app.schemas import DownloadFormat
from app.services.downloader import download
from app.services.job_manager.job import Job
from app.services.job_manager.status import JobStatus


class JobManager:
    """In-memory job registry with asyncio-based concurrency control.

    Single-process only — `_jobs` is a plain dict and the semaphore is bound
    to one event loop. Swap for Redis/RQ when moving to multi-worker.
    """

    def __init__(self, *, max_concurrent: int, download_dir: Path) -> None:
        self._download_dir = download_dir
        self._jobs: dict[str, Job] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def enqueue(self, url: str, fmt: DownloadFormat) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], url=url, format=fmt)
        self._jobs[job.id] = job
        task = asyncio.create_task(self._run(job.id), name=f"download-{job.id}")
        task.add_done_callback(lambda t, jid=job.id: self._tasks.pop(jid, None))
        self._tasks[job.id] = task
        return job

    async def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    async def list(self) -> list[Job]:
        return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    async def file_path(self, job_id: str) -> Path | None:
        job = self._jobs.get(job_id)
        if job is None or job.filename is None:
            return None
        path = self._download_dir / job.filename
        return path if path.exists() else None

    async def shutdown(self) -> None:
        """Cancel in-flight tasks. Call from FastAPI lifespan on app shutdown."""
        tasks = list(self._tasks.values())
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _run(self, job_id: str) -> None:
        job = self._jobs[job_id]
        try:
            async with self._semaphore:
                self._mark(job, status=JobStatus.DOWNLOADING)
                result = await download(
                    job.url,
                    job.format,
                    out_dir=self._download_dir,
                    out_id=job.id,
                    on_progress=lambda p: self._on_progress(job, p),
                )
                job.title = result.title
                job.thumbnail = result.thumbnail
                job.filename = result.filename
                job.filesize = result.filesize
                job.progress = 1.0
                self._mark(job, status=JobStatus.COMPLETED)
        except asyncio.CancelledError:
            self._mark(job, status=JobStatus.FAILED, error="cancelled")
            raise
        except Exception as exc:  # noqa: BLE001
            self._mark(job, status=JobStatus.FAILED, error=str(exc))

    @staticmethod
    def _mark(job: Job, *, status: JobStatus, error: str | None = None) -> None:
        job.status = status
        if error is not None:
            job.error = error
        job.updated_at = time.time()

    @staticmethod
    def _on_progress(job: Job, progress: float) -> None:
        # Called from the downloader's worker thread. Plain attribute writes
        # are safe under the GIL; readers may observe a slightly stale value,
        # which is acceptable for progress reporting.
        job.progress = progress
        job.updated_at = time.time()
