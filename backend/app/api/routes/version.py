import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["version"])


class VersionResponse(BaseModel):
    version: str
    commit: str
    built_at: str


# These are baked at image build time via Dockerfile ARGs; the defaults make
# local `uv run` reflect that you're not on a stamped image.
COMMIT = os.environ.get("VD_GIT_SHA", "dev")
BUILT_AT = os.environ.get("VD_BUILT_AT", "dev")


@router.get(
    "/version",
    response_model=VersionResponse,
    summary="Build identity for the running backend",
)
async def version() -> VersionResponse:
    return VersionResponse(version="0.1.0", commit=COMMIT, built_at=BUILT_AT)
