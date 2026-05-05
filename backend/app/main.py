from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.services.job_manager import JobManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.job_manager = JobManager(
        max_concurrent=settings.max_concurrent_downloads,
        download_dir=settings.download_dir,
    )
    try:
        yield
    finally:
        await app.state.job_manager.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()
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
