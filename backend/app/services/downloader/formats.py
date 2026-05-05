from typing import Any

from app.schemas import DownloadFormat

FORMAT_SELECTORS: dict[DownloadFormat, dict[str, Any]] = {
    DownloadFormat.BEST: {"format": "bv*+ba/b"},
    DownloadFormat.AUDIO: {
        "format": "bestaudio/best",
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}
        ],
    },
    DownloadFormat.MP4_1080P: {"format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]"},
    DownloadFormat.MP4_720P: {"format": "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[ext=mp4]"},
}
