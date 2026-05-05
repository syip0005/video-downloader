from fastapi import APIRouter, status
from fastapi.responses import FileResponse

from app.api.deps import JobManagerDep
from app.core.exceptions import JobNotFound
from app.schemas import DownloadRequest, JobResponse
from app.services.job_manager import Job

router = APIRouter(prefix="/downloads", tags=["downloads"])


def _to_response(job: Job) -> JobResponse:
    return JobResponse(
        id=job.id,
        url=job.url,
        format=job.format,
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


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=JobResponse)
async def create_download(payload: DownloadRequest, manager: JobManagerDep) -> JobResponse:
    job = await manager.enqueue(str(payload.url), payload.format)
    return _to_response(job)


@router.get("", response_model=list[JobResponse])
async def list_downloads(manager: JobManagerDep) -> list[JobResponse]:
    return [_to_response(j) for j in await manager.list()]


@router.get("/{job_id}", response_model=JobResponse)
async def get_download(job_id: str, manager: JobManagerDep) -> JobResponse:
    job = await manager.get(job_id)
    if job is None:
        raise JobNotFound(f"job {job_id} not found")
    return _to_response(job)


@router.get("/{job_id}/file")
async def get_download_file(job_id: str, manager: JobManagerDep) -> FileResponse:
    path = await manager.file_path(job_id)
    if path is None:
        raise JobNotFound(f"file for job {job_id} not available")
    return FileResponse(path, filename=path.name)
