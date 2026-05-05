from app.services.downloader.progress import make_progress_hook


def _capture():
    out: list[float] = []
    return out, make_progress_hook(out.append)


def test_byte_based_progress_grows_monotonically():
    out, hook = _capture()
    hook({"status": "downloading", "total_bytes": 100, "downloaded_bytes": 25})
    hook({"status": "downloading", "total_bytes": 100, "downloaded_bytes": 50})
    hook({"status": "downloading", "total_bytes": 100, "downloaded_bytes": 90})
    assert out == [0.25, 0.5, 0.9]


def test_progress_is_capped_at_099():
    out, hook = _capture()
    hook({"status": "downloading", "total_bytes": 100, "downloaded_bytes": 100})
    assert out == [0.99]


def test_no_regression_when_estimate_jumps_backwards():
    # yt-dlp can briefly report a smaller total than before — we shouldn't
    # let the bar jump backwards.
    out, hook = _capture()
    hook({"status": "downloading", "total_bytes_estimate": 100, "downloaded_bytes": 60})
    hook({"status": "downloading", "total_bytes_estimate": 200, "downloaded_bytes": 60})
    assert out == [0.6]  # second event would be 0.3, suppressed


def test_fragment_fallback_when_bytes_unknown():
    out, hook = _capture()
    hook({"status": "downloading", "fragment_index": 1, "fragment_count": 10})
    hook({"status": "downloading", "fragment_index": 5, "fragment_count": 10})
    hook({"status": "downloading", "fragment_index": 9, "fragment_count": 10})
    assert out == [0.1, 0.5, 0.9]


def test_time_fallback_when_bytes_and_fragments_unknown():
    out, hook = _capture()
    hook({"status": "downloading", "elapsed": 10, "eta": 30})
    hook({"status": "downloading", "elapsed": 25, "eta": 25})
    assert out == [0.25, 0.5]


def test_multi_stream_progress_does_not_reset_between_video_and_audio():
    out, hook = _capture()
    # Video stream: 100 bytes total. Reach halfway then yt-dlp marks finished
    # (we don't simulate a perfect 100% sample to avoid the 0.99 cap masking
    # the cross-stream behaviour).
    hook({"status": "downloading", "total_bytes": 100, "downloaded_bytes": 50})
    hook({"status": "finished", "total_bytes": 100})
    # Audio stream begins. Combined progress:
    #   video accounted for: 100 bytes
    #   audio: 25 of 100 -> total 125/200 = 0.625
    hook({"status": "downloading", "total_bytes": 100, "downloaded_bytes": 25})
    #   audio: 75 of 100 -> total 175/200 = 0.875
    hook({"status": "downloading", "total_bytes": 100, "downloaded_bytes": 75})
    assert out == [0.5, 0.625, 0.875]


def test_unrelated_status_events_are_ignored():
    out, hook = _capture()
    hook({"status": "started"})
    hook({"status": "error"})
    hook({})
    assert out == []
