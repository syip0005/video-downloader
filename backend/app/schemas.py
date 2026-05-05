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


class JobResponse(BaseModel):
    id: str
    url: str
    format: DownloadFormat
    status: str
    progress: float
    title: str | None = None
    thumbnail: str | None = None
    filename: str | None = None
    filesize: int | None = None
    error: str | None = None
    created_at: float
    updated_at: float


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
