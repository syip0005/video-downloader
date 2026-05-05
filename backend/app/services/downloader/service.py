import asyncio
from dataclasses import dataclass
from pathlib import Path

from app.schemas import DownloadFormat
from app.services.downloader.progress import ProgressCallback


@dataclass
class DownloadResult:
    filename: str
    filesize: int
    title: str | None
    thumbnail: str | None


def _download_blocking(
    url: str,
    fmt: DownloadFormat,
    *,
    out_dir: Path,
    out_id: str,
    on_progress: ProgressCallback | None,
) -> DownloadResult:
    """Synchronous yt-dlp call. Do not call from the event loop directly."""
    raise NotImplementedError


async def download(
    url: str,
    fmt: DownloadFormat,
    *,
    out_dir: Path,
    out_id: str,
    on_progress: ProgressCallback | None = None,
) -> DownloadResult:
    """Async wrapper that offloads the blocking yt-dlp call to a worker thread."""
    return await asyncio.to_thread(
        _download_blocking, url, fmt, out_dir=out_dir, out_id=out_id, on_progress=on_progress
    )
