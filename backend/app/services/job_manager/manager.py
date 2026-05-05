import asyncio
import contextlib
import logging
import time
import uuid
from pathlib import Path

from app.schemas import DownloadFormat
from app.services.downloader import download
from app.services.downloader.url import canonicalize
from app.services.job_manager.job import Job
from app.services.job_manager.status import JobStatus

log = logging.getLogger(__name__)


class JobManager:
    """In-memory job registry with asyncio-based concurrency control.

    Single-process only — `_jobs` is a plain dict and the semaphore is bound
    to one event loop. Swap for Redis/RQ when moving to multi-worker.
    """

    def __init__(
        self,
        *,
        max_concurrent: int,
        download_dir: Path,
        max_filesize_bytes: int,
        max_duration_seconds: int,
        max_total_disk_bytes: int,
    ) -> None:
        self._download_dir = download_dir
        self._max_filesize_bytes = max_filesize_bytes
        self._max_duration_seconds = max_duration_seconds
        self._max_total_disk_bytes = max_total_disk_bytes
        self._jobs: dict[str, Job] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def enqueue(
        self, url: str, fmt: DownloadFormat, format_id: str | None = None
    ) -> Job:
        existing = self._find_existing(url, fmt, format_id)
        if existing is not None:
            # Refresh updated_at so a hit keeps the entry alive past the next
            # TTL sweep — for an in-flight job this is harmless; for a
            # COMPLETED job it prevents re-requesting on the boundary of
            # expiry from still letting it get evicted.
            existing.updated_at = time.time()
            log.info(
                "reuse job=%s status=%s url=%s fmt=%s format_id=%s",
                existing.id,
                existing.status,
                url,
                fmt,
                format_id,
            )
            return existing

        job = Job(id=uuid.uuid4().hex[:12], url=url, format=fmt, format_id=format_id)
        self._jobs[job.id] = job
        log.info("enqueue job=%s url=%s fmt=%s format_id=%s", job.id, url, fmt, format_id)
        task = asyncio.create_task(self._run(job.id), name=f"download-{job.id}")
        task.add_done_callback(lambda t, jid=job.id: self._tasks.pop(jid, None))
        self._tasks[job.id] = task
        return job

    def _find_existing(
        self, url: str, fmt: DownloadFormat, format_id: str | None
    ) -> Job | None:
        """Coalesce + cache lookup for an equivalent submission.

        Matches by canonicalized URL so `youtu.be/<id>`, `youtube.com/watch?v=<id>`,
        `youtube.com/shorts/<id>`, and tracking-decorated variants all collapse to
        the same key. The cache key also includes `(format, format_id)` so different
        qualities of the same video stay distinct.

        Preference order:
          1. An in-flight job (QUEUED or DOWNLOADING) — newest first. Lets a second
             submit attach to a running download instead of starting a parallel
             one (request coalescing).
          2. The newest COMPLETED job whose file is still on disk. If the file
             was evicted (TTL or disk quota), the record is skipped — eviction
             means "gone forever, fetch it again", by design.

        Returns None when neither applies, so the caller starts a fresh download.
        """
        canonical = canonicalize(url)
        matches = [
            j
            for j in self._jobs.values()
            if j.format == fmt
            and j.format_id == format_id
            and canonicalize(j.url) == canonical
        ]

        in_flight = sorted(
            (j for j in matches if j.status in (JobStatus.QUEUED, JobStatus.DOWNLOADING)),
            key=lambda j: j.created_at,
            reverse=True,
        )
        if in_flight:
            return in_flight[0]

        completed = sorted(
            (j for j in matches if j.status == JobStatus.COMPLETED and j.filename is not None),
            key=lambda j: j.updated_at,
            reverse=True,
        )
        for job in completed:
            assert job.filename is not None
            if (self._download_dir / job.filename).exists():
                return job
        return None

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

    async def cleanup(self, ttl_seconds: float) -> int:
        """Evict completed/failed jobs older than `ttl_seconds`; unlink their files.

        Returns the number of jobs evicted. Safe to call concurrently with enqueue
        because asyncio is single-threaded — this coroutine doesn't await mid-mutation.
        """
        cutoff = time.time() - ttl_seconds
        terminal = {JobStatus.COMPLETED, JobStatus.FAILED}
        evicted = 0
        for jid in list(self._jobs.keys()):
            job = self._jobs[jid]
            if job.status not in terminal or job.updated_at >= cutoff:
                continue
            if job.filename:
                path = self._download_dir / job.filename
                with contextlib.suppress(FileNotFoundError):
                    path.unlink()
            del self._jobs[jid]
            evicted += 1
        if evicted:
            log.info("cleanup evicted=%d ttl_seconds=%s", evicted, ttl_seconds)
        return evicted

    async def enforce_disk_quota(self, max_bytes: int) -> int:
        """Evict oldest terminal jobs until total filesize is at or below `max_bytes`.

        Only touches COMPLETED/FAILED jobs — never evicts in-flight downloads,
        even if their partial files would push usage over. Oldest-first by
        `updated_at` (which for terminal jobs equals their completion time),
        so this behaves as FIFO eviction over finished downloads.
        """
        terminal = {JobStatus.COMPLETED, JobStatus.FAILED}
        total = sum(j.filesize or 0 for j in self._jobs.values())
        if total <= max_bytes:
            return 0
        candidates = sorted(
            (j for j in self._jobs.values() if j.status in terminal),
            key=lambda j: j.updated_at,
        )
        evicted = 0
        for job in candidates:
            if total <= max_bytes:
                break
            if job.filename:
                path = self._download_dir / job.filename
                with contextlib.suppress(FileNotFoundError):
                    path.unlink()
            total -= job.filesize or 0
            del self._jobs[job.id]
            evicted += 1
        if evicted:
            log.info("disk_quota evicted=%d max_bytes=%d", evicted, max_bytes)
        return evicted

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
                    max_filesize_bytes=self._max_filesize_bytes,
                    max_duration_seconds=self._max_duration_seconds,
                    format_id=job.format_id,
                    on_progress=lambda p: self._on_progress(job, p),
                )
                job.title = result.title
                job.thumbnail = result.thumbnail
                job.filename = result.filename
                job.filesize = result.filesize
                job.progress = 1.0
                self._mark(job, status=JobStatus.COMPLETED)
                log.info("job done id=%s file=%s", job.id, job.filename)
            # Outside the semaphore — eviction shouldn't count against the
            # concurrent-download budget, and it's safe because this job is
            # already terminal.
            await self.enforce_disk_quota(self._max_total_disk_bytes)
        except asyncio.CancelledError:
            self._mark(job, status=JobStatus.FAILED, error="cancelled")
            raise
        except Exception as exc:  # noqa: BLE001
            log.warning("job failed id=%s err=%s", job.id, exc)
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
