import asyncio
import json
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError, UnsupportedError

from app.core.exceptions import DownloadFailed, MediaTooLarge, UnsupportedURL
from app.schemas import DownloadFormat
from app.services.downloader.formats import FORMAT_SELECTORS
from app.services.downloader.progress import (
    ProgressCallback,
    make_postprocessor_hook,
    make_progress_hook,
)

log = logging.getLogger(__name__)


@dataclass
class DownloadResult:
    filename: str
    filesize: int
    title: str | None
    thumbnail: str | None


@dataclass
class FormatVariant:
    format_id: str
    ext: str | None
    resolution: str | None
    height: int | None
    fps: float | None
    vcodec: str | None
    acodec: str | None
    filesize: int | None
    filesize_approx: int | None
    tbr: float | None
    abr: float | None
    format_note: str | None
    has_video: bool
    has_audio: bool


@dataclass
class ProbeResult:
    title: str | None
    thumbnail: str | None
    duration: float | None
    is_live: bool
    formats: list[FormatVariant]


def _probe(url: str) -> dict[str, Any]:
    probe_opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True}
    try:
        with YoutubeDL(probe_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except UnsupportedError as e:
        raise UnsupportedURL(str(e)) from e
    except DownloadError as e:
        raise DownloadFailed(str(e)) from e
    if info is None:
        raise DownloadFailed("yt-dlp returned no info on probe")
    if "entries" in info:
        entries = [e for e in info["entries"] if e]
        if not entries:
            raise DownloadFailed("no downloadable entries")
        info = entries[0]
    return info


def _summarise_formats(info: dict[str, Any]) -> list[FormatVariant]:
    """Project yt-dlp's raw format list to a UI-friendly subset.

    yt-dlp returns every variant including storyboards, manifest entries, and
    audio/video-only fragments. We drop entries that have neither audio nor
    video (storyboards/thumbnails) — everything else stays so the frontend
    can present combined, video-only, and audio-only options.
    """
    raw = info.get("formats") or []
    out: list[FormatVariant] = []
    for f in raw:
        vcodec = f.get("vcodec")
        acodec = f.get("acodec")
        has_video = bool(vcodec) and vcodec != "none"
        has_audio = bool(acodec) and acodec != "none"
        if not (has_video or has_audio):
            continue
        fid = f.get("format_id")
        if not fid:
            continue
        out.append(
            FormatVariant(
                format_id=str(fid),
                ext=f.get("ext"),
                resolution=f.get("resolution"),
                height=f.get("height"),
                fps=f.get("fps"),
                vcodec=vcodec,
                acodec=acodec,
                filesize=f.get("filesize"),
                filesize_approx=f.get("filesize_approx"),
                tbr=f.get("tbr"),
                abr=f.get("abr"),
                format_note=f.get("format_note"),
                has_video=has_video,
                has_audio=has_audio,
            )
        )
    return out


def _probe_blocking(url: str) -> ProbeResult:
    info = _probe(url)
    return ProbeResult(
        title=info.get("title"),
        thumbnail=info.get("thumbnail"),
        duration=info.get("duration"),
        is_live=bool(info.get("is_live")),
        formats=_summarise_formats(info),
    )


async def probe(url: str) -> ProbeResult:
    """Async wrapper around the blocking yt-dlp probe."""
    return await asyncio.to_thread(_probe_blocking, url)


def _output_codecs(path: Path) -> tuple[str | None, str | None]:
    """Return (video_codec, audio_codec) per ffprobe; (None, None) on failure."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,codec_type",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
    except (subprocess.SubprocessError, FileNotFoundError):
        return None, None

    try:
        streams = json.loads(result.stdout).get("streams", [])
    except json.JSONDecodeError:
        return None, None

    video = next(
        (s.get("codec_name") for s in streams if s.get("codec_type") == "video"),
        None,
    )
    audio = next(
        (s.get("codec_name") for s in streams if s.get("codec_type") == "audio"),
        None,
    )
    return video, audio


def _ensure_ios_compatible(path: Path) -> Path:
    """Transcode to H.264/AAC if the merged file isn't already iOS-savable.

    The codec-filtered selectors usually pick a compatible stream and this
    is a no-op. Kicks in only when the source has no H.264 / AAC stream
    at all — e.g. some YouTube uploads are AV1-only at higher resolutions.
    Audio-only outputs (.m4a from the AUDIO format) skip transcoding;
    the FFmpegExtractAudio postprocessor already produces AAC.
    """
    video_codec, audio_codec = _output_codecs(path)
    if video_codec is None:
        # Audio-only file — postprocessor produces AAC/m4a already.
        return path
    if video_codec == "h264" and audio_codec == "aac":
        return path

    log.info(
        "transcoding %s to H.264/AAC (was vcodec=%s acodec=%s)",
        path.name,
        video_codec,
        audio_codec,
    )

    out = path.parent / f"{path.stem}.h264.mp4"
    audio_arg = ["-c:a", "copy"] if audio_codec == "aac" else ["-c:a", "aac", "-b:a", "192k"]
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(path),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        *audio_arg,
        "-movflags",
        "+faststart",
        str(out),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=3600)
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or b"").decode("utf-8", errors="replace")
        log.error("transcode failed: %s", stderr[-500:])
        out.unlink(missing_ok=True)
        return path
    except subprocess.TimeoutExpired:
        log.error("transcode timed out for %s", path.name)
        out.unlink(missing_ok=True)
        return path

    path.unlink()
    out.rename(path)
    return path


def _validate(info: dict[str, Any], *, max_duration_seconds: int) -> None:
    if info.get("is_live"):
        raise UnsupportedURL("live streams are not supported")
    duration = info.get("duration")
    if duration is not None and duration > max_duration_seconds:
        raise MediaTooLarge(
            f"video duration {int(duration)}s exceeds limit of {max_duration_seconds}s"
        )


def _download_blocking(
    url: str,
    fmt: DownloadFormat,
    *,
    out_dir: Path,
    out_id: str,
    max_filesize_bytes: int,
    max_duration_seconds: int,
    format_id: str | None,
    on_progress: ProgressCallback | None,
) -> DownloadResult:
    """Synchronous yt-dlp call. Do not call from the event loop directly."""
    out_dir.mkdir(parents=True, exist_ok=True)

    log.info("probe %s", url)
    info = _probe(url)
    _validate(info, max_duration_seconds=max_duration_seconds)

    ydl_opts: dict[str, Any] = {
        "outtmpl": str(out_dir / f"{out_id}.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "restrictfilenames": False,
        "windowsfilenames": True,
        "merge_output_format": "mp4",
        "max_filesize": max_filesize_bytes,
    }
    if format_id is not None:
        # Caller picked a specific yt-dlp format selector (e.g. "137+140").
        # Don't apply preset postprocessors — the caller is opting into
        # whatever that selector produces, including raw audio.
        ydl_opts["format"] = format_id
    else:
        ydl_opts.update(FORMAT_SELECTORS[fmt])

    if on_progress is not None:
        ydl_opts["progress_hooks"] = [make_progress_hook(on_progress)]
        ydl_opts["postprocessor_hooks"] = [make_postprocessor_hook(on_progress)]

    log.info("download %s (fmt=%s, format_id=%s, out_id=%s)", url, fmt, format_id, out_id)
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise DownloadFailed("yt-dlp returned no info")
            if "entries" in info:
                entries = [e for e in info["entries"] if e]
                if not entries:
                    raise DownloadFailed("no downloadable entries")
                info = entries[0]
            resolved = ydl.prepare_filename(info)
    except UnsupportedError as e:
        raise UnsupportedURL(str(e)) from e
    except DownloadError as e:
        msg = str(e)
        # yt-dlp aborts with this exact phrase when max_filesize is hit.
        if "File is larger than max-filesize" in msg:
            raise MediaTooLarge(
                f"file exceeds max size of {max_filesize_bytes} bytes"
            ) from e
        raise DownloadFailed(msg) from e

    final_path = Path(resolved)
    if not final_path.exists():
        candidates = sorted(out_dir.glob(f"{out_id}.*"))
        if not candidates:
            raise DownloadFailed(f"output file not found for {out_id}")
        final_path = candidates[0]

    # Transcode to H.264/AAC if the picked stream wasn't iOS-savable. This
    # is a no-op when the format selector landed on an avc1+mp4a pair
    # (the common case); only fires for AV1-only / Opus-only sources.
    final_path = _ensure_ios_compatible(final_path)

    if on_progress is not None:
        on_progress(1.0)

    log.info("done %s -> %s (%d bytes)", url, final_path.name, final_path.stat().st_size)
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
    max_filesize_bytes: int,
    max_duration_seconds: int,
    format_id: str | None = None,
    on_progress: ProgressCallback | None = None,
) -> DownloadResult:
    """Async wrapper that offloads the blocking yt-dlp call to a worker thread."""
    return await asyncio.to_thread(
        _download_blocking,
        url,
        fmt,
        out_dir=out_dir,
        out_id=out_id,
        max_filesize_bytes=max_filesize_bytes,
        max_duration_seconds=max_duration_seconds,
        format_id=format_id,
        on_progress=on_progress,
    )
