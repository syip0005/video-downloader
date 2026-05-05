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


def download(
    url: str,
    fmt: DownloadFormat,
    *,
    out_dir: Path,
    out_id: str,
    on_progress: ProgressCallback | None = None,
) -> DownloadResult:
    """Synchronously download `url` with yt-dlp. Caller offloads to a thread."""
    raise NotImplementedError
