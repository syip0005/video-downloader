import mimetypes

from fastapi import APIRouter, status
from fastapi.responses import FileResponse

from app.api.deps import JobManagerDep
from app.core.exceptions import JobNotFound
from app.schemas import (
    DownloadRequest,
    FormatInfo,
    JobResponse,
    ProbeRequest,
    ProbeResponse,
)
from app.services.downloader import probe as probe_url
from app.services.job_manager import Job

router = APIRouter(prefix="/downloads", tags=["downloads"])


def _to_response(job: Job) -> JobResponse:
    return JobResponse(
        id=job.id,
        url=job.url,
        format=job.format,
        format_id=job.format_id,
        status=job.status.value,
        progress=job.progress,
        title=job.title,
        thumbnail=job.thumbnail,
        filename=job.filename,
        filesize=job.filesize,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=JobResponse,
    summary="Submit a URL for download",
)
async def create_download(payload: DownloadRequest, manager: JobManagerDep) -> JobResponse:
    job = await manager.enqueue(str(payload.url), payload.format, payload.format_id)
    return _to_response(job)


@router.post(
    "/probe",
    response_model=ProbeResponse,
    summary="Inspect a URL and list available formats",
)
async def probe_download(payload: ProbeRequest) -> ProbeResponse:
    result = await probe_url(str(payload.url))
    return ProbeResponse(
        title=result.title,
        thumbnail=result.thumbnail,
        duration=result.duration,
        is_live=result.is_live,
        formats=[FormatInfo(**vars(f)) for f in result.formats],
    )


@router.get("", response_model=list[JobResponse], summary="List all jobs (newest first)")
async def list_downloads(manager: JobManagerDep) -> list[JobResponse]:
    return [_to_response(j) for j in await manager.list()]


@router.get("/{job_id}", response_model=JobResponse, summary="Get job status")
async def get_download(job_id: str, manager: JobManagerDep) -> JobResponse:
    job = await manager.get(job_id)
    if job is None:
        raise JobNotFound(f"job {job_id} not found")
    return _to_response(job)


async def _serve_file(job_id: str, manager: JobManagerDep) -> FileResponse:
    path = await manager.file_path(job_id)
    if path is None:
        raise JobNotFound(f"file for job {job_id} not available")

    media_type, _ = mimetypes.guess_type(path.name)
    # `inline` (not `attachment`) so iOS Shortcuts' "Get contents of URLs"
    # gets a media-typed response that "Save to Photos" recognises as a
    # video. The frontend `<a download>` attribute is enough to make
    # browsers download the file when the user hits the save button on
    # non-iOS, regardless of disposition.
    return FileResponse(
        path,
        filename=path.name,
        media_type=media_type or "application/octet-stream",
        content_disposition_type="inline",
    )


@router.get(
    "/{job_id}/file",
    summary="Stream the downloaded file",
    response_class=FileResponse,
)
async def get_download_file(job_id: str, manager: JobManagerDep) -> FileResponse:
    return await _serve_file(job_id, manager)


@router.get(
    "/{job_id}/file/{filename}",
    summary=(
        "Same file as /file, but with the filename in the URL path so iOS "
        "Shortcuts can derive the UTI from the .mp4/.m4a extension"
    ),
    response_class=FileResponse,
    include_in_schema=False,
)
async def get_download_file_named(
    job_id: str,
    filename: str,  # noqa: ARG001 — decorative, only the id is resolved
    manager: JobManagerDep,
) -> FileResponse:
    return await _serve_file(job_id, manager)
