import pytest

from app.core.exceptions import MediaTooLarge, UnsupportedURL
from app.services.downloader.service import _validate


def test_validate_accepts_normal_video():
    _validate({"duration": 600}, max_duration_seconds=3600)


def test_validate_accepts_unknown_duration():
    # Some extractors don't report duration; we can't reject those.
    _validate({"duration": None}, max_duration_seconds=3600)


def test_validate_rejects_live_stream():
    with pytest.raises(UnsupportedURL):
        _validate({"is_live": True, "duration": 1}, max_duration_seconds=3600)


def test_validate_rejects_overlong_video():
    with pytest.raises(MediaTooLarge):
        _validate({"duration": 7200}, max_duration_seconds=3600)
