export type DownloadFormat = "best" | "audio" | "mp4_1080p" | "mp4_720p"

export type JobStatus = "queued" | "downloading" | "completed" | "failed"

export interface JobResponse {
  id: string
  url: string
  format: DownloadFormat
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

export function createDownload(
  url: string,
  format: DownloadFormat = "best",
): Promise<JobResponse> {
  return request<JobResponse>("/api/downloads", {
    method: "POST",
    body: JSON.stringify({ url, format }),
  })
}

export function getDownload(id: string): Promise<JobResponse> {
  return request<JobResponse>(`/api/downloads/${id}`)
}

export function fileUrl(id: string): string {
  return `/api/downloads/${id}/file`
}

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  "completed",
  "failed",
])
