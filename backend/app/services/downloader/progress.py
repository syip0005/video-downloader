from collections.abc import Callable
from typing import Any

ProgressCallback = Callable[[float], None]


def make_progress_hook(on_progress: ProgressCallback) -> Callable[[dict[str, Any]], None]:
    def hook(payload: dict[str, Any]) -> None:
        if payload.get("status") != "downloading":
            return
        total = payload.get("total_bytes") or payload.get("total_bytes_estimate")
        done = payload.get("downloaded_bytes", 0)
        if total:
            on_progress(min(done / total, 0.99))

    return hook
