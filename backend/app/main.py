import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging
from app.services.job_manager import JobManager

log = logging.getLogger(__name__)


async def _cleanup_loop(manager: JobManager, settings: Settings) -> None:
    """Periodically evict expired jobs. Owned by the lifespan."""
    while True:
        try:
            await asyncio.sleep(settings.cleanup_interval_seconds)
            await manager.cleanup(settings.job_ttl_seconds)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("cleanup loop iteration failed")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    manager = JobManager(
        max_concurrent=settings.max_concurrent_downloads,
        download_dir=settings.download_dir,
        max_filesize_bytes=settings.max_filesize_bytes,
        max_duration_seconds=settings.max_duration_seconds,
    )
    app.state.job_manager = manager

    cleanup_task = asyncio.create_task(_cleanup_loop(manager, settings), name="job-cleanup")
    log.info(
        "startup max_concurrent=%d ttl=%ds cleanup_interval=%ds",
        settings.max_concurrent_downloads,
        settings.job_ttl_seconds,
        settings.cleanup_interval_seconds,
    )
    try:
        yield
    finally:
        cleanup_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await cleanup_task
        await manager.shutdown()
        log.info("shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    app = FastAPI(title="Video Downloader", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
