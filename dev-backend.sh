#!/usr/bin/env bash
# Start the FastAPI backend on :8000 with auto-reload.
set -euo pipefail

cd "$(dirname "$0")/backend"

uv sync --quiet
exec uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
