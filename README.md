# Video Downloader

A self-hosted web UI for downloading videos from YouTube, Reddit, X (Twitter), and anywhere else [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports. Paste a URL, get a file — designed to make saving videos to your iPhone (or any device) friction-free.

## Stack

- **Backend** — Python 3.11+, [FastAPI](https://fastapi.tiangolo.com/), [yt-dlp](https://github.com/yt-dlp/yt-dlp), managed with [`uv`](https://docs.astral.sh/uv/).
- **Frontend** — [Vite 6](https://vite.dev/) + [React 19](https://react.dev/) + TypeScript, styled with [Tailwind CSS v4](https://tailwindcss.com/).

## Project layout

```
video-downloader/
├── backend/        FastAPI service that wraps yt-dlp
└── frontend/       Vite + React UI
```

## Getting started

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: <http://localhost:8000/api/health>

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev server runs on <http://localhost:5173> and proxies `/api/*` to the backend.

## Roadmap

- [ ] `POST /api/downloads` — submit URL + format
- [ ] `GET /api/downloads` — list jobs with progress
- [ ] `GET /api/downloads/{id}/file` — stream the finished file
- [ ] Paste-to-download UI with live progress
- [ ] iOS-friendly download trigger (uses `Content-Disposition: attachment`)
- [ ] Optional auth for public deployments

## License

MIT
