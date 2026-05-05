# Video Downloader

A self-hosted web UI for downloading videos from YouTube, Reddit, X (Twitter), and anywhere else [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports. Paste a URL, get a file — designed to make saving videos to your iPhone (or any device) friction-free.

## Stack

- **Backend** — Python 3.13, [FastAPI](https://fastapi.tiangolo.com/), [yt-dlp](https://github.com/yt-dlp/yt-dlp), managed with [`uv`](https://docs.astral.sh/uv/).
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

## Self-hosting (Docker)

The repo ships a single-image setup: the frontend builds into static files and is served by FastAPI, so you only run one container.

```bash
docker compose up -d --build
```

Then open <http://localhost:8000> on any device on your network. Downloads land in `./downloads/` on the host (bind-mounted from `compose.yml`).

`ffmpeg` and `tini` are baked into the image. The container runs as a non-root user. Single uvicorn worker by design — `JobManager` state is in-memory, multiple workers would each see different jobs.

To customize limits, copy `backend/.env.example` and set the `VD_*` env vars in `compose.yml` under `environment:`. All settings are optional.

### Putting it on the public internet

Don't expose `:8000` directly — there's no auth yet. For a single-user deploy, the easy paths are:

- **Tailscale Funnel** — exposes the container over HTTPS to your own tailnet only. Zero config beyond `tailscale funnel 8000`.
- **Caddy in front** — terminate TLS and slap on HTTP Basic auth in ~5 lines of `Caddyfile`.

## Roadmap

- [ ] `POST /api/downloads` — submit URL + format
- [ ] `GET /api/downloads` — list jobs with progress
- [ ] `GET /api/downloads/{id}/file` — stream the finished file
- [ ] Paste-to-download UI with live progress
- [ ] iOS-friendly download trigger (uses `Content-Disposition: attachment`)
- [ ] Optional auth for public deployments

## License

MIT
