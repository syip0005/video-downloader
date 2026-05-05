from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, HttpUrl


class DownloadFormat(StrEnum):
    BEST = "best"
    AUDIO = "audio"
    MP4_1080P = "mp4_1080p"
    MP4_720P = "mp4_720p"


class DownloadRequest(BaseModel):
    url: HttpUrl
    format: DownloadFormat = DownloadFormat.BEST
    # When set, overrides `format` and is passed to yt-dlp verbatim as its
    # format selector (e.g. "137+140" or "22"). Lets the UI pick a specific
    # variant returned by /api/probe.
    format_id: str | None = None


class JobResponse(BaseModel):
    id: str
    url: str
    format: DownloadFormat
    format_id: str | None = None
    status: str
    progress: float
    title: str | None = None
    thumbnail: str | None = None
    filename: str | None = None
    filesize: int | None = None
    error: str | None = None
    created_at: float
    updated_at: float


class ProbeRequest(BaseModel):
    url: HttpUrl


class FormatInfo(BaseModel):
    format_id: str
    ext: str | None = None
    resolution: str | None = None
    height: int | None = None
    fps: float | None = None
    vcodec: str | None = None
    acodec: str | None = None
    filesize: int | None = None
    filesize_approx: int | None = None
    tbr: float | None = None
    abr: float | None = None
    format_note: str | None = None
    has_video: bool
    has_audio: bool


class ProbeResponse(BaseModel):
    title: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    is_live: bool = False
    formats: list[FormatInfo]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
