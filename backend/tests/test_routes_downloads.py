from __future__ import annotations

import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_job_manager
from app.main import app
from app.schemas import DownloadFormat
from app.services.job_manager import Job, JobStatus


class FakeJobManager:
    """Stand-in for JobManager that records calls and never spawns tasks."""

    def __init__(self, download_dir: Path) -> None:
        self.download_dir = download_dir
        self.jobs: dict[str, Job] = {}
        self.enqueued: list[tuple[str, DownloadFormat]] = []

    async def enqueue(self, url: str, fmt: DownloadFormat) -> Job:
        job = Job(id=f"j{len(self.jobs)}", url=url, format=fmt)
        self.jobs[job.id] = job
        self.enqueued.append((url, fmt))
        return job

    async def get(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    async def list(self) -> list[Job]:
        return sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True)

    async def file_path(self, job_id: str) -> Path | None:
        job = self.jobs.get(job_id)
        if job is None or job.filename is None:
            return None
        path = self.download_dir / job.filename
        return path if path.exists() else None

    def add_completed(self, job_id: str, filename: str, content: bytes = b"hi") -> None:
        path = self.download_dir / filename
        path.write_bytes(content)
        job = Job(
            id=job_id,
            url="https://example.com",
            format=DownloadFormat.BEST,
            status=JobStatus.COMPLETED,
            progress=1.0,
            filename=filename,
            filesize=path.stat().st_size,
            updated_at=time.time(),
        )
        self.jobs[job_id] = job


@pytest.fixture
def fake_manager(tmp_path: Path) -> Iterator[FakeJobManager]:
    d = tmp_path / "downloads"
    d.mkdir()
    fm = FakeJobManager(download_dir=d)
    app.dependency_overrides[get_job_manager] = lambda: fm
    yield fm
    app.dependency_overrides.clear()


@pytest.fixture
def client(fake_manager: FakeJobManager) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_create_download_returns_202_and_queued_job(
    client: TestClient, fake_manager: FakeJobManager
) -> None:
    r = client.post(
        "/api/downloads", json={"url": "https://example.com/v", "format": "best"}
    )
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "queued"
    assert body["url"] == "https://example.com/v"
    assert fake_manager.enqueued == [("https://example.com/v", DownloadFormat.BEST)]


def test_create_download_rejects_invalid_url(client: TestClient) -> None:
    r = client.post("/api/downloads", json={"url": "not-a-url"})
    assert r.status_code == 422


def test_create_download_rejects_unknown_format(client: TestClient) -> None:
    r = client.post(
        "/api/downloads", json={"url": "https://example.com/v", "format": "wat"}
    )
    assert r.status_code == 422


def test_get_download_404_when_missing(client: TestClient) -> None:
    r = client.get("/api/downloads/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "job_not_found"


def test_get_download_returns_job(client: TestClient, fake_manager: FakeJobManager) -> None:
    fake_manager.add_completed("abc", "abc.mp4")
    r = client.get("/api/downloads/abc")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "abc"
    assert body["status"] == "completed"
    assert body["filename"] == "abc.mp4"


def test_list_downloads_orders_newest_first(
    client: TestClient, fake_manager: FakeJobManager
) -> None:
    client.post("/api/downloads", json={"url": "https://example.com/a"})
    client.post("/api/downloads", json={"url": "https://example.com/b"})
    r = client.get("/api/downloads")
    assert r.status_code == 200
    urls = [j["url"] for j in r.json()]
    assert urls == ["https://example.com/b", "https://example.com/a"]


def test_get_file_404_when_job_missing(client: TestClient) -> None:
    r = client.get("/api/downloads/nope/file")
    assert r.status_code == 404


def test_get_file_404_when_file_not_yet_on_disk(
    client: TestClient, fake_manager: FakeJobManager
) -> None:
    job = Job(
        id="pending",
        url="https://example.com",
        format=DownloadFormat.BEST,
        status=JobStatus.DOWNLOADING,
    )
    fake_manager.jobs[job.id] = job
    r = client.get("/api/downloads/pending/file")
    assert r.status_code == 404


def test_get_file_streams_with_attachment_disposition(
    client: TestClient, fake_manager: FakeJobManager
) -> None:
    fake_manager.add_completed("done", "done.mp4", content=b"video-bytes")
    r = client.get("/api/downloads/done/file")
    assert r.status_code == 200
    assert r.content == b"video-bytes"
    cd = r.headers["content-disposition"]
    assert cd.startswith("attachment")
    assert "done.mp4" in cd
    assert r.headers["content-type"] == "video/mp4"
