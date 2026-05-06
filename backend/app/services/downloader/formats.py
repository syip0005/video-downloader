from typing import Any

from app.schemas import DownloadFormat

# YouTube increasingly serves AV1 inside MP4 containers and Opus in WebM —
# both fail iOS Photos' "Save Video" accept rules, which require H.264
# (avc1.*) for video and AAC (mp4a.*) for audio in an MP4 container. We
# pin codec families in the selectors so the merged output is iOS-savable.
# Each selector has a fallback chain: tightest constraint first, then
# loosen container/quality, finally degrade to "anything that works" so
# we never fail to produce *something*.

_VID = "vcodec^=avc1"  # H.264 / AVC — any profile/level
_AUD = "acodec^=mp4a"  # AAC — any profile

FORMAT_SELECTORS: dict[DownloadFormat, dict[str, Any]] = {
    DownloadFormat.BEST: {
        "format": (
            f"bv*[{_VID}]+ba[{_AUD}]"
            f"/bv*[{_VID}]+ba"
            f"/b[{_VID}]"
            "/bv*+ba/b"
        ),
        "merge_output_format": "mp4",
    },
    DownloadFormat.AUDIO: {
        "format": f"ba[{_AUD}]/bestaudio",
        "postprocessors": [
            # m4a = AAC in an MP4 container. When the source is already
            # AAC this is a no-op remux; otherwise ffmpeg transcodes.
            {"key": "FFmpegExtractAudio", "preferredcodec": "m4a", "preferredquality": "192"}
        ],
    },
    DownloadFormat.MP4_1080P: {
        "format": (
            f"bv*[height<=1080][ext=mp4][{_VID}]+ba[ext=m4a][{_AUD}]"
            f"/bv*[height<=1080][{_VID}]+ba[{_AUD}]"
            f"/b[height<=1080][ext=mp4][{_VID}]"
            "/b[height<=1080][ext=mp4]"
        ),
        "merge_output_format": "mp4",
    },
    DownloadFormat.MP4_720P: {
        "format": (
            f"bv*[height<=720][ext=mp4][{_VID}]+ba[ext=m4a][{_AUD}]"
            f"/bv*[height<=720][{_VID}]+ba[{_AUD}]"
            f"/b[height<=720][ext=mp4][{_VID}]"
            "/b[height<=720][ext=mp4]"
        ),
        "merge_output_format": "mp4",
    },
}
