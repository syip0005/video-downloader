from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base class for domain errors translated into HTTP responses."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.code)
        self.message = message or self.code


class JobNotFound(AppError):
    status_code = 404
    code = "job_not_found"


class DownloadFailed(AppError):
    status_code = 502
    code = "download_failed"


class UnsupportedURL(AppError):
    status_code = 400
    code = "unsupported_url"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )
