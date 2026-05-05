import asyncio
from pathlib import Path

import pytest

from app.schemas import DownloadFormat
from app.services.downloader import DownloadResult
from app.services.job_manager import JobManager, JobStatus


def _run(coro):
    return asyncio.run(coro)


def _result_for(out_dir: Path, out_id: str, content: bytes = b"x") -> DownloadResult:
    path = out_dir / f"{out_id}.mp4"
    path.write_bytes(content)
    return DownloadResult(
        filename=path.name, filesize=path.stat().st_size, title="t", thumbnail=None
    )


@pytest.fixture
def tmp_download_dir(tmp_path: Path) -> Path:
    d = tmp_path / "downloads"
    d.mkdir()
    return d


def _patch_download(monkeypatch, fake):
    # Patch in both the source module and the re-export used by the manager.
    monkeypatch.setattr("app.services.downloader.service.download", fake)
    monkeypatch.setattr("app.services.job_manager.manager.download", fake)


def test_enqueue_creates_queued_job(tmp_download_dir, monkeypatch):
    async def never_returns(*_a, **_kw):
        await asyncio.sleep(3600)

    _patch_download(monkeypatch, never_returns)

    async def go():
        m = JobManager(max_concurrent=1, download_dir=tmp_download_dir)
        job = await m.enqueue("https://example.com/v", DownloadFormat.BEST)
        assert job.id and job.url == "https://example.com/v"
        assert job.status == JobStatus.QUEUED
        assert (await m.get(job.id)) is job
        await m.shutdown()

    _run(go())


def test_successful_download(tmp_download_dir, monkeypatch):
    async def fake(url, fmt, *, out_dir, out_id, on_progress=None):
        if on_progress:
            on_progress(0.5)
        return _result_for(out_dir, out_id, b"hello")

    _patch_download(monkeypatch, fake)

    async def go():
        m = JobManager(max_concurrent=2, download_dir=tmp_download_dir)
        job = await m.enqueue("https://example.com/a", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[job.id], timeout=2)
        done = await m.get(job.id)
        assert done.status == JobStatus.COMPLETED
        assert done.progress == 1.0
        assert done.filesize == 5
        assert done.filename == f"{job.id}.mp4"
        assert (await m.file_path(job.id)) == tmp_download_dir / done.filename

    _run(go())


def test_failed_download_records_error(tmp_download_dir, monkeypatch):
    async def fake(*_a, **_kw):
        raise RuntimeError("boom")

    _patch_download(monkeypatch, fake)

    async def go():
        m = JobManager(max_concurrent=1, download_dir=tmp_download_dir)
        job = await m.enqueue("https://example.com/b", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[job.id], timeout=2)
        done = await m.get(job.id)
        assert done.status == JobStatus.FAILED
        assert done.error == "boom"
        assert done.filename is None
        assert (await m.file_path(job.id)) is None

    _run(go())


def test_concurrency_is_capped(tmp_download_dir, monkeypatch):
    in_flight = 0
    peak = 0
    gate = asyncio.Event()

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None):
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        try:
            await gate.wait()
            return _result_for(out_dir, out_id)
        finally:
            in_flight -= 1

    _patch_download(monkeypatch, fake)

    async def go():
        m = JobManager(max_concurrent=2, download_dir=tmp_download_dir)
        jobs = [
            await m.enqueue(f"https://example.com/{i}", DownloadFormat.BEST) for i in range(5)
        ]
        # Yield enough times for the first two to enter `fake`.
        for _ in range(20):
            await asyncio.sleep(0)
        assert peak == 2
        gate.set()
        await asyncio.gather(*[m._tasks[j.id] for j in jobs])
        assert peak == 2
        for j in jobs:
            assert (await m.get(j.id)).status == JobStatus.COMPLETED

    _run(go())


def test_list_orders_by_created_desc(tmp_download_dir, monkeypatch):
    async def fake(*_a, **_kw):
        await asyncio.sleep(3600)

    _patch_download(monkeypatch, fake)

    async def go():
        m = JobManager(max_concurrent=1, download_dir=tmp_download_dir)
        a = await m.enqueue("https://example.com/a", DownloadFormat.BEST)
        await asyncio.sleep(0.01)
        b = await m.enqueue("https://example.com/b", DownloadFormat.BEST)
        ids = [j.id for j in await m.list()]
        assert ids == [b.id, a.id]
        await m.shutdown()

    _run(go())


def test_file_path_missing_when_file_not_on_disk(tmp_download_dir, monkeypatch):
    async def fake(url, fmt, *, out_dir, out_id, on_progress=None):
        # Report a file that we never actually create.
        return DownloadResult(filename=f"{out_id}.mp4", filesize=10, title=None, thumbnail=None)

    _patch_download(monkeypatch, fake)

    async def go():
        m = JobManager(max_concurrent=1, download_dir=tmp_download_dir)
        job = await m.enqueue("https://example.com/c", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[job.id], timeout=2)
        assert (await m.file_path(job.id)) is None

    _run(go())


def test_shutdown_cancels_in_flight(tmp_download_dir, monkeypatch):
    started = asyncio.Event()

    async def fake(*_a, **_kw):
        started.set()
        await asyncio.sleep(3600)

    _patch_download(monkeypatch, fake)

    async def go():
        m = JobManager(max_concurrent=1, download_dir=tmp_download_dir)
        job = await m.enqueue("https://example.com/d", DownloadFormat.BEST)
        await asyncio.wait_for(started.wait(), timeout=2)
        await m.shutdown()
        done = await m.get(job.id)
        assert done.status == JobStatus.FAILED
        assert done.error == "cancelled"

    _run(go())
