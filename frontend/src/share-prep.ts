/*
 * Stage the finished server file into a client-side File suitable for
 * navigator.share({ files }) on iOS. Mirrors cobalt's invariant that the
 * File is already local before the share button is reachable: caller
 * runs prepareShareFile() *during* the post-download phase and only
 * reveals the share UI once it resolves. OPFS-backed File is preferred
 * (best Shortcut compatibility per past testing); falls back to an
 * in-memory File on any timeout/failure so we never trap the UI.
 */

import { fileUrl, type JobResponse } from "./api"

export interface SharePrep {
  file: File | null
  cleanup: () => void
  /** Why `file` is null. Absent when file !== null. */
  reason?: "non-ios" | "no-share" | "too-big" | "error"
  errorMessage?: string
}

// iOS holds the entire blob in tab RAM for the share IPC. Cobalt caps at
// 256 MB because per-tab RAM ceiling on iOS is ~384 MB; bigger files OOM.
export const IOS_SHARE_MAX_BYTES = 256 * 1024 * 1024

const OPFS_STAGING_DIR = "mums-share-staging"
const OPFS_STAGING_TIMEOUT_MS = 90_000

const EXT_TO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
}

function mimeFromFilename(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot < 0) return "application/octet-stream"
  const ext = name.slice(dot + 1).toLowerCase()
  return EXT_TO_MIME[ext] ?? "application/octet-stream"
}

// OPFS getFileHandle rejects "/" and "\". yt-dlp output can include
// channel/title slashes; clamp to a safe subset and keep the extension
// intact so iOS' UTI resolver picks up "video.mp4" → public.movie.
function sanitizeFilename(name: string): string {
  let s = name.replace(/[/\\:*?"<>|]/g, "_").trim()
  if (s.length > 200) {
    const dot = s.lastIndexOf(".")
    const ext = dot > 0 ? s.slice(dot) : ""
    s = s.slice(0, 200 - ext.length) + ext
  }
  return s || "video.mp4"
}

export function isIos(): boolean {
  return (
    typeof window !== "undefined" &&
    /iphone|ipad|ipod/i.test(window.navigator.userAgent)
  )
}

function canShareFiles(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function"
  )
}

async function getStagingDir(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === "undefined") return null
  if (!navigator.storage?.getDirectory) return null
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(OPFS_STAGING_DIR, { create: true })
  } catch {
    return null
  }
}

async function streamViaWorker(
  url: string,
  dirName: string,
  filename: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  const worker = new Worker(
    new URL("./share-stager.worker.ts", import.meta.url),
    { type: "module" },
  )
  let timer: number | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        if (timer !== undefined) window.clearTimeout(timer)
        signal.removeEventListener("abort", onAbort)
      }
      const onAbort = () => {
        cleanup()
        reject(new DOMException("aborted", "AbortError"))
      }
      timer = window.setTimeout(() => {
        cleanup()
        reject(new Error("opfs staging timed out"))
      }, timeoutMs)
      worker.addEventListener(
        "message",
        (e: MessageEvent) => {
          const data = e.data as { ok?: boolean; error?: string }
          cleanup()
          if (data?.ok) resolve()
          else reject(new Error(data?.error ?? "share worker failed"))
        },
        { once: true },
      )
      worker.addEventListener("error", (e) => {
        cleanup()
        reject(new Error(e.message ?? "share worker crashed"))
      })
      signal.addEventListener("abort", onAbort)
      worker.postMessage({ type: "init", url, dirName, filename })
    })
  } finally {
    worker.terminate()
  }
}

interface StagingResult {
  file: File
  // Disposes the OPFS inode, if any. Safe to call multiple times.
  cleanup: () => Promise<void>
}

async function materializeToOpfs(
  url: string,
  filename: string,
  signal: AbortSignal,
): Promise<StagingResult> {
  const dir = await getStagingDir()
  if (!dir) throw new Error("opfs unavailable")
  await streamViaWorker(
    url,
    OPFS_STAGING_DIR,
    filename,
    signal,
    OPFS_STAGING_TIMEOUT_MS,
  )
  const handle = await dir.getFileHandle(filename)
  let file = await handle.getFile()
  if (!file.type) {
    // File from getFile() often comes with empty .type; force the right
    // MIME so iOS' UTI resolver routes "Save to Photos" correctly.
    file = new File([file], file.name, { type: mimeFromFilename(filename) })
  }
  return {
    file,
    cleanup: async () => {
      try {
        const d = await getStagingDir()
        if (d) await d.removeEntry(handle.name)
      } catch {
        /* ignore */
      }
    },
  }
}

async function fetchAsFile(
  url: string,
  filename: string,
  signal: AbortSignal,
): Promise<File> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  const blob = await res.blob()
  const type = blob.type || mimeFromFilename(filename)
  return new File([blob], filename, { type })
}

const NOOP_CLEANUP = () => {}

/**
 * Prepare a share-ready File for the given completed job. Resolves only
 * when staging has finished (or definitively failed); callers should
 * keep their progress UI visible until then so the share button reveal
 * always coincides with a ready file.
 */
export async function prepareShareFile(
  job: JobResponse,
  signal: AbortSignal,
): Promise<SharePrep> {
  if (!isIos()) {
    return { file: null, cleanup: NOOP_CLEANUP, reason: "non-ios" }
  }
  if (!canShareFiles()) {
    return { file: null, cleanup: NOOP_CLEANUP, reason: "no-share" }
  }
  if (
    typeof job.filesize === "number" &&
    job.filesize > IOS_SHARE_MAX_BYTES
  ) {
    return { file: null, cleanup: NOOP_CLEANUP, reason: "too-big" }
  }

  const filename = sanitizeFilename(job.filename ?? "video.mp4")
  const url = fileUrl(job.id)

  let opfsCleanup: (() => Promise<void>) | null = null
  let file: File
  try {
    const staged = await materializeToOpfs(url, filename, signal)
    file = staged.file
    opfsCleanup = staged.cleanup
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === "AbortError") {
      return {
        file: null,
        cleanup: NOOP_CLEANUP,
        reason: "error",
        errorMessage: "aborted",
      }
    }
    console.warn(
      "opfs share prep failed, falling back to in-memory File:",
      err,
    )
    try {
      file = await fetchAsFile(url, filename, signal)
    } catch (fetchErr) {
      const fetchName = (fetchErr as { name?: string })?.name
      if (fetchName === "AbortError") {
        return {
          file: null,
          cleanup: NOOP_CLEANUP,
          reason: "error",
          errorMessage: "aborted",
        }
      }
      console.error("share prep failed:", fetchErr)
      return {
        file: null,
        cleanup: NOOP_CLEANUP,
        reason: "error",
        errorMessage:
          (fetchErr as { message?: string })?.message ??
          "couldn't prepare share",
      }
    }
  }

  if (
    typeof navigator.canShare === "function" &&
    !navigator.canShare({ files: [file] })
  ) {
    console.warn("canShare returned false for File", {
      name: file.name,
      size: file.size,
      type: file.type,
    })
    if (opfsCleanup) void opfsCleanup()
    return {
      file: null,
      cleanup: NOOP_CLEANUP,
      reason: "error",
      errorMessage: "iOS rejected the file for sharing",
    }
  }

  let disposed = false
  return {
    file,
    cleanup: () => {
      if (disposed) return
      disposed = true
      if (opfsCleanup) void opfsCleanup()
    },
  }
}
