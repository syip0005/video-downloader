from collections.abc import Callable
from typing import Any

ProgressCallback = Callable[[float], None]


def make_progress_hook(on_progress: ProgressCallback) -> Callable[[dict[str, Any]], None]:
    """Yt-dlp progress hook reporting a monotonic 0..0.99 ratio across all streams.

    Handles three reporting shapes yt-dlp uses:
      1. Byte-based — `total_bytes` (or `_estimate`) and `downloaded_bytes`.
         Used by single-file downloads (most non-YouTube sites).
      2. Fragment-based — `fragment_index` and `fragment_count`. Used by HLS
         and DASH (most YouTube videos), where byte totals are unknown until
         each fragment header is read.
      3. Time-based — `elapsed` + `eta`. Last-resort fallback for extractors
         that report neither bytes nor fragments mid-download.

    For multi-stream merges (e.g. `bv*+ba`) we accumulate finished streams'
    byte totals so the bar doesn't reset to 0 when the audio stream begins.
    Output is clamped to be monotonic — yt-dlp can briefly report regressed
    estimates that would otherwise make the bar jitter backwards.
    """
    completed_bytes = 0
    last_ratio = 0.0

    def emit(ratio: float) -> None:
        nonlocal last_ratio
        capped = min(max(ratio, 0.0), 0.99)
        if capped > last_ratio:
            last_ratio = capped
            on_progress(capped)

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
        if total:
            emit((completed_bytes + done) / (completed_bytes + total))
            return

        frag_idx = payload.get("fragment_index")
        frag_count = payload.get("fragment_count")
        if frag_idx is not None and frag_count:
            emit(frag_idx / frag_count)
            return

        elapsed = payload.get("elapsed")
        eta = payload.get("eta")
        if elapsed is not None and eta is not None and (elapsed + eta) > 0:
            emit(elapsed / (elapsed + eta))

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
