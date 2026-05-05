# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

A self-hosted video downloader web app. Backend wraps `yt-dlp` and exposes a small HTTP API; frontend is a paste-and-download UI optimized for mobile (especially iOS) so users can save videos straight to their device.

## Layout

- `backend/` — FastAPI app (`app/main.py` is the entrypoint), Python ≥3.11, managed with `uv`.
- `frontend/` — Vite + React 19 + TypeScript + Tailwind CSS v4.

## Commands

### Backend (`cd backend`)

- `uv sync` — install/refresh dependencies (creates `.venv` and lockfile on first run).
- `uv run uvicorn app.main:app --reload` — dev server on `:8000`.
- `uv run ruff check .` / `uv run ruff format .` — lint & format.
- `uv run pytest` — tests.
- `uv add <pkg>` — add a runtime dep. Use `uv add --dev <pkg>` for dev deps. Don't hand-edit `pyproject.toml` for deps.

### Frontend (`cd frontend`)

- `npm install` — install deps.
- `npm run dev` — Vite dev server on `:5173` (proxies `/api` → `:8000`).
- `npm run build` — typecheck + production build.
- `npm run preview` — serve the production build locally.

## Conventions

- **Python**: type-annotate everything; prefer `pathlib`/`pydantic` models over dicts at boundaries; use `async def` for FastAPI routes and offload blocking yt-dlp work with `asyncio.to_thread`.
- **TypeScript**: strict mode is on. Avoid `any`. Prefer function components with hooks; React 19 patterns (no `forwardRef` boilerplate where avoidable, use `use()` for promises if helpful).
- **Tailwind v4**: configured via `@import "tailwindcss"` in `src/index.css` and the `@tailwindcss/vite` plugin — there is no `tailwind.config.js`. Use CSS `@theme` blocks for design tokens.
- **API surface**: everything user-facing is under `/api/*`. The frontend dev server proxies that prefix, so use relative paths (e.g. `fetch('/api/health')`).

## Things to keep in mind

- yt-dlp evolves quickly; pin a recent version and bump regularly.
- Downloads can be large; stream files rather than buffering, and don't block the event loop.
- If you add background jobs, the current plan is in-memory tracking. For multi-worker deploys, swap in a real queue (Redis/RQ, Arq, etc.) — don't bolt state onto module globals if Uvicorn is run with `--workers > 1`.
- Mobile (iOS Safari) is a primary target. Test layouts at narrow widths and ensure download links use `Content-Disposition: attachment` so Safari surfaces the "Save to Files" sheet.
