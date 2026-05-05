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


def _make(download_dir: Path, *, max_concurrent: int = 2) -> JobManager:
    return JobManager(
        max_concurrent=max_concurrent,
        download_dir=download_dir,
        max_filesize_bytes=10 * 1024 * 1024 * 1024,
        max_duration_seconds=3600,
        max_total_disk_bytes=10 * 1024 * 1024 * 1024,
    )


def _patch_download(monkeypatch, fake):
    # Patch in both the source module and the re-export used by the manager.
    monkeypatch.setattr("app.services.downloader.service.download", fake)
    monkeypatch.setattr("app.services.job_manager.manager.download", fake)


def test_enqueue_creates_queued_job(tmp_download_dir, monkeypatch):
    async def never_returns(*_a, **_kw):
        await asyncio.sleep(3600)

    _patch_download(monkeypatch, never_returns)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=1)
        job = await m.enqueue("https://example.com/v", DownloadFormat.BEST)
        assert job.id and job.url == "https://example.com/v"
        assert job.status == JobStatus.QUEUED
        assert (await m.get(job.id)) is job
        await m.shutdown()

    _run(go())


def test_successful_download(tmp_download_dir, monkeypatch):
    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        if on_progress:
            on_progress(0.5)
        return _result_for(out_dir, out_id, b"hello")

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=2)
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
        m = _make(tmp_download_dir, max_concurrent=1)
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

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
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
        m = _make(tmp_download_dir, max_concurrent=2)
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
        m = _make(tmp_download_dir, max_concurrent=1)
        a = await m.enqueue("https://example.com/a", DownloadFormat.BEST)
        await asyncio.sleep(0.01)
        b = await m.enqueue("https://example.com/b", DownloadFormat.BEST)
        ids = [j.id for j in await m.list()]
        assert ids == [b.id, a.id]
        await m.shutdown()

    _run(go())


def test_file_path_missing_when_file_not_on_disk(tmp_download_dir, monkeypatch):
    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        # Report a file that we never actually create.
        return DownloadResult(filename=f"{out_id}.mp4", filesize=10, title=None, thumbnail=None)

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=1)
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
        m = _make(tmp_download_dir, max_concurrent=1)
        job = await m.enqueue("https://example.com/d", DownloadFormat.BEST)
        await asyncio.wait_for(started.wait(), timeout=2)
        await m.shutdown()
        done = await m.get(job.id)
        assert done.status == JobStatus.FAILED
        assert done.error == "cancelled"

    _run(go())


def test_cleanup_evicts_old_terminal_jobs_and_unlinks_files(tmp_download_dir, monkeypatch):
    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        return _result_for(out_dir, out_id, b"data")

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=2)
        job = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[job.id], timeout=2)
        # Backdate it so cleanup considers it expired.
        m._jobs[job.id].updated_at -= 10_000
        path = tmp_download_dir / m._jobs[job.id].filename
        assert path.exists()

        evicted = await m.cleanup(ttl_seconds=3600)
        assert evicted == 1
        assert (await m.get(job.id)) is None
        assert not path.exists()

    _run(go())


def test_cleanup_keeps_recent_and_in_flight_jobs(tmp_download_dir, monkeypatch):
    started = asyncio.Event()
    release = asyncio.Event()

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        started.set()
        await release.wait()
        return _result_for(out_dir, out_id)

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=1)
        running = await m.enqueue("https://example.com/r", DownloadFormat.BEST)
        await asyncio.wait_for(started.wait(), timeout=2)

        # In-flight job (DOWNLOADING) must never be evicted.
        evicted = await m.cleanup(ttl_seconds=0)
        assert evicted == 0
        assert (await m.get(running.id)) is not None

        release.set()
        await asyncio.wait_for(m._tasks[running.id], timeout=2)

        # Just-completed job (within TTL) is also kept.
        evicted = await m.cleanup(ttl_seconds=3600)
        assert evicted == 0
        assert (await m.get(running.id)) is not None

    _run(go())


def test_enqueue_returns_cached_job_for_same_url_and_format(tmp_download_dir, monkeypatch):
    calls = 0

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        nonlocal calls
        calls += 1
        return _result_for(out_dir, out_id, b"hello")

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=2)
        first = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[first.id], timeout=2)

        # Second submit with identical (url, fmt) reuses the existing job.
        second = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        assert second.id == first.id
        assert calls == 1
        # No background task spawned for the cache hit.
        assert first.id not in m._tasks

    _run(go())


def test_cache_hit_refreshes_updated_at_so_ttl_doesnt_evict_actively_used_files(
    tmp_download_dir, monkeypatch
):
    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        return _result_for(out_dir, out_id, b"hello")

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=1)
        first = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[first.id], timeout=2)
        # Pretend the job is about to expire.
        first.updated_at -= 10_000
        old_updated = first.updated_at

        await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        assert first.updated_at > old_updated

    _run(go())


def test_different_format_does_not_hit_cache(tmp_download_dir, monkeypatch):
    calls = 0

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        nonlocal calls
        calls += 1
        return _result_for(out_dir, out_id)

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=2)
        a = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[a.id], timeout=2)

        b = await m.enqueue("https://example.com/x", DownloadFormat.AUDIO)
        await asyncio.wait_for(m._tasks[b.id], timeout=2)
        assert b.id != a.id
        assert calls == 2

    _run(go())


def test_cache_misses_when_file_was_evicted_off_disk(tmp_download_dir, monkeypatch):
    calls = 0

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        nonlocal calls
        calls += 1
        return _result_for(out_dir, out_id, b"hello")

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=2)
        first = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[first.id], timeout=2)

        # Simulate the disk-quota path or external cleanup removing the file.
        (tmp_download_dir / first.filename).unlink()

        second = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[second.id], timeout=2)
        assert second.id != first.id
        assert calls == 2

    _run(go())


def test_failed_job_is_not_used_as_a_cache_hit(tmp_download_dir, monkeypatch):
    attempts = 0

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("transient")
        return _result_for(out_dir, out_id)

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=2)
        a = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[a.id], timeout=2)
        assert (await m.get(a.id)).status == JobStatus.FAILED

        b = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        await asyncio.wait_for(m._tasks[b.id], timeout=2)
        assert b.id != a.id
        assert (await m.get(b.id)).status == JobStatus.COMPLETED

    _run(go())


def test_coalesces_to_existing_in_flight_job(tmp_download_dir, monkeypatch):
    calls = 0
    gate = asyncio.Event()

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        nonlocal calls
        calls += 1
        await gate.wait()
        return _result_for(out_dir, out_id, b"data")

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=2)
        first = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        # Yield so the task enters `fake` and starts waiting on `gate`.
        for _ in range(20):
            await asyncio.sleep(0)

        second = await m.enqueue("https://example.com/x", DownloadFormat.BEST)
        # Same job returned, no second task started.
        assert second.id == first.id
        assert calls == 1

        gate.set()
        await asyncio.wait_for(m._tasks[first.id], timeout=2)
        assert (await m.get(first.id)).status == JobStatus.COMPLETED

    _run(go())


def test_canonicalised_urls_collapse_to_one_cache_entry(tmp_download_dir, monkeypatch):
    calls = 0

    async def fake(url, fmt, *, out_dir, out_id, on_progress=None, **_):
        nonlocal calls
        calls += 1
        return _result_for(out_dir, out_id, b"data")

    _patch_download(monkeypatch, fake)

    async def go():
        m = _make(tmp_download_dir, max_concurrent=2)
        # Long-form YouTube URL with tracking params.
        first = await m.enqueue(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracker&t=42",
            DownloadFormat.BEST,
        )
        await asyncio.wait_for(m._tasks[first.id], timeout=2)

        # Short youtu.be form for the same video — should hit the cache.
        second = await m.enqueue("https://youtu.be/dQw4w9WgXcQ", DownloadFormat.BEST)
        assert second.id == first.id
        assert calls == 1

    _run(go())
