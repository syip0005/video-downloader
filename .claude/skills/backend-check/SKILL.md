---
name: backend-check
description: Lint, format, and type-check the Python backend in `backend/` using ruff and ty. Use when the user asks to lint, format, type-check, or "check" the backend, or after making backend changes to verify them.
---

# Backend check

Run linting, formatting, and type checking for the FastAPI backend.

## Steps

Run all of the following from `backend/`:

1. **Format** — `uv run ruff format .`
2. **Lint (with autofix)** — `uv run ruff check --fix .`
3. **Type check** — `uv run ty check`

Run them in sequence. Stop and report if any step fails after autofix; otherwise report a one-line summary that all checks passed.

## Notes

- `ty` is Astral's type checker (pre-1.0); treat output as informational where it disagrees with clearly correct runtime behavior, but do not silence errors without cause.
- Configuration lives in `backend/pyproject.toml` under `[tool.ruff]` and `[tool.ty]`.
