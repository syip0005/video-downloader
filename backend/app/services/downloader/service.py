import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError, UnsupportedError

from app.core.exceptions import DownloadFailed, UnsupportedURL
from app.schemas import DownloadFormat
from app.services.downloader.formats import FORMAT_SELECTORS
from app.services.downloader.progress import (
    ProgressCallback,
    make_postprocessor_hook,
    make_progress_hook,
)


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
    out_dir.mkdir(parents=True, exist_ok=True)

    ydl_opts: dict[str, Any] = {
        "outtmpl": str(out_dir / f"{out_id}.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "restrictfilenames": False,
        "windowsfilenames": True,
        "merge_output_format": "mp4",
    }
    ydl_opts.update(FORMAT_SELECTORS[fmt])

    if on_progress is not None:
        ydl_opts["progress_hooks"] = [make_progress_hook(on_progress)]
        ydl_opts["postprocessor_hooks"] = [make_postprocessor_hook(on_progress)]

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise DownloadFailed("yt-dlp returned no info")
            # Playlists shouldn't occur (noplaylist=True), but guard anyway.
            if "entries" in info:
                entries = [e for e in info["entries"] if e]
                if not entries:
                    raise DownloadFailed("no downloadable entries")
                info = entries[0]
            resolved = ydl.prepare_filename(info)
    except UnsupportedError as e:
        raise UnsupportedURL(str(e)) from e
    except DownloadError as e:
        raise DownloadFailed(str(e)) from e

    final_path = Path(resolved)
    # Postprocessors (e.g. audio extraction, mp4 merge) may change the extension.
    if not final_path.exists():
        candidates = sorted(out_dir.glob(f"{out_id}.*"))
        if not candidates:
            raise DownloadFailed(f"output file not found for {out_id}")
        final_path = candidates[0]

    if on_progress is not None:
        on_progress(1.0)

    return DownloadResult(
        filename=final_path.name,
        filesize=final_path.stat().st_size,
        title=info.get("title"),
        thumbnail=info.get("thumbnail"),
    )


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
