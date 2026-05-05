from collections.abc import Callable
from typing import Any

ProgressCallback = Callable[[float], None]


def make_progress_hook(on_progress: ProgressCallback) -> Callable[[dict[str, Any]], None]:
    """Yt-dlp progress hook reporting a single 0..0.99 ratio across all streams.

    yt-dlp fires the hook independently for each stream (e.g. `bv*+ba` downloads
    video then audio). Naively forwarding the per-stream ratio resets the bar to
    0 when the second stream begins. We accumulate finished streams' byte totals
    so the reported ratio is monotonic over the whole job.
    """
    completed_bytes = 0

    def hook(payload: dict[str, Any]) -> None:
        nonlocal completed_bytes
        status = payload.get("status")
        if status == "finished":
            total = payload.get("total_bytes") or payload.get("total_bytes_estimate") or 0
            completed_bytes += int(total)
            return
        if status != "downloading":
            return
        total = payload.get("total_bytes") or payload.get("total_bytes_estimate")
        done = payload.get("downloaded_bytes", 0)
        if not total:
            return
        ratio = (completed_bytes + done) / (completed_bytes + total)
        on_progress(min(ratio, 0.99))

    return hook


def make_postprocessor_hook(on_progress: ProgressCallback) -> Callable[[dict[str, Any]], None]:
    """Yt-dlp postprocessor hook so the UI knows we've left the download phase.

    Without this, `make_progress_hook` reports up to 0.99 then goes silent while
    ffmpeg merges/extracts — looks frozen on long files. We re-emit 0.99 on each
    postprocessor boundary so the consumer can refresh a "processing" indicator.
    The terminal 1.0 is emitted by the caller once the file is on disk.
    """

    def hook(payload: dict[str, Any]) -> None:
        if payload.get("status") in {"started", "finished"}:
            on_progress(0.99)

    return hook
