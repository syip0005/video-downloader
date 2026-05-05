# syntax=docker/dockerfile:1.7

# ---- Stage 1: build the Vite frontend ----
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build


# ---- Stage 2: backend runtime ----
FROM python:3.13-slim AS runtime

# ffmpeg is required by yt-dlp for merging video+audio streams and audio extraction.
# tini gives us a proper PID 1 so SIGTERM reaches uvicorn cleanly on `docker stop`.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Drop in uv from its official image — pinned, fast, no curl-pipe-bash.
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /uvx /usr/local/bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    VD_DOWNLOAD_DIR=/data/downloads \
    VD_FRONTEND_DIST=/app/frontend/dist

WORKDIR /app/backend

# Install deps first for cache friendliness — only re-runs when lockfile changes.
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY backend/app ./app
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

COPY --from=frontend /build/dist /app/frontend/dist

# Run as a non-root user; pre-create the downloads dir with the right ownership.
RUN useradd --system --create-home --uid 1001 app \
    && mkdir -p /data/downloads \
    && chown -R app:app /data /app
USER app

EXPOSE 8000

# Single worker on purpose: JobManager state is in-memory per process.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
