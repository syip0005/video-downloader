export type DownloadFormat = "best" | "audio" | "mp4_1080p" | "mp4_720p"

export type JobStatus = "queued" | "downloading" | "completed" | "failed"

export interface JobResponse {
  id: string
  url: string
  format: DownloadFormat
  format_id: string | null
  status: JobStatus
  progress: number
  title: string | null
  thumbnail: string | null
  filename: string | null
  filesize: number | null
  error: string | null
  created_at: number
  updated_at: number
}

export interface ProbeFormat {
  format_id: string
  ext: string
  resolution: string | null
  height: number | null
  fps: number | null
  vcodec: string | null
  acodec: string | null
  filesize: number | null
  filesize_approx: number | null
  tbr: number | null
  abr: number | null
  format_note: string | null
  has_video: boolean
  has_audio: boolean
}

export interface ProbeResponse {
  title: string | null
  thumbnail: string | null
  duration: number | null
  formats: ProbeFormat[]
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export function probeDownload(url: string): Promise<ProbeResponse> {
  return request<ProbeResponse>("/api/downloads/probe", {
    method: "POST",
    body: JSON.stringify({ url }),
  })
}

export function createDownload(
  url: string,
  opts: { format?: DownloadFormat; formatId?: string } = {},
): Promise<JobResponse> {
  const body: Record<string, unknown> = { url }
  if (opts.format) body.format = opts.format
  if (opts.formatId) body.format_id = opts.formatId
  return request<JobResponse>("/api/downloads", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function getDownload(id: string): Promise<JobResponse> {
  return request<JobResponse>(`/api/downloads/${id}`)
}

// Pass `filename` to embed it in the path. The backend ignores the value
// for resolution but iOS Shortcuts needs the URL to end in .mp4/.m4a/etc.
// so "Save to Photos" can derive the media UTI from the extension.
export function fileUrl(id: string, filename?: string | null): string {
  const base = `/api/downloads/${id}/file`
  if (!filename) return base
  return `${base}/${encodeURIComponent(filename)}`
}

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  "completed",
  "failed",
])
