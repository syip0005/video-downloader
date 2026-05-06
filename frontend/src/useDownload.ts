import { useCallback, useEffect, useRef, useState } from "react"
import {
  ApiError,
  createDownload,
  getDownload,
  probeDownload,
  TERMINAL_STATUSES,
  type DownloadFormat,
  type JobResponse,
  type ProbeResponse,
} from "./api"
import { prepareShareFile, type SharePrep } from "./share-prep"

const POLL_INTERVAL_MS = 1000

export type DownloadPhase =
  | "idle"
  | "probing"
  | "picking"
  | "submitting"
  | "active"
  // Backend says completed; we're staging the file client-side so the
  // share button is hot-and-ready at the same moment we reveal it.
  | "staging"
  | "done"
  | "error"

export interface DownloadState {
  phase: DownloadPhase
  url: string | null
  probe: ProbeResponse | null
  job: JobResponse | null
  error: string | null
  /** Populated once the post-download share staging completes. */
  share: SharePrep | null
}

const INITIAL: DownloadState = {
  phase: "idle",
  url: null,
  probe: null,
  job: null,
  error: null,
  share: null,
}

export function useDownload() {
  const [state, setState] = useState<DownloadState>(INITIAL)
  const pollTimer = useRef<number | null>(null)
  const cancelled = useRef(false)
  const stagingAbort = useRef<AbortController | null>(null)
  const shareCleanup = useRef<(() => void) | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const cancelStaging = useCallback(() => {
    if (stagingAbort.current) {
      stagingAbort.current.abort()
      stagingAbort.current = null
    }
  }, [])

  const disposeShare = useCallback(() => {
    if (shareCleanup.current) {
      shareCleanup.current()
      shareCleanup.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cancelled.current = true
    stopPolling()
    cancelStaging()
    disposeShare()
    setState(INITIAL)
  }, [stopPolling, cancelStaging, disposeShare])

  useEffect(
    () => () => {
      stopPolling()
      cancelStaging()
      disposeShare()
    },
    [stopPolling, cancelStaging, disposeShare],
  )

  const stage = useCallback((job: JobResponse) => {
    cancelStaging()
    disposeShare()
    const ac = new AbortController()
    stagingAbort.current = ac
    setState((s) => ({ ...s, phase: "staging", job, error: null }))
    void prepareShareFile(job, ac.signal)
      .then((share) => {
        if (cancelled.current) {
          share.cleanup()
          return
        }
        if (stagingAbort.current !== ac) {
          // Another staging started in the meantime — drop this one.
          share.cleanup()
          return
        }
        stagingAbort.current = null
        shareCleanup.current = share.cleanup
        setState((s) => ({ ...s, phase: "done", share }))
      })
      .catch(() => {
        // prepareShareFile catches its own errors and returns a SharePrep
        // with reason="error". Reaching here means an unexpected throw —
        // still surface the file via plain anchor download.
        if (cancelled.current) return
        if (stagingAbort.current !== ac) return
        stagingAbort.current = null
        setState((s) => ({
          ...s,
          phase: "done",
          share: { file: null, cleanup: () => {}, reason: "error" },
        }))
      })
  }, [cancelStaging, disposeShare])

  const poll = useCallback(
    (id: string) => {
      const tick = async () => {
        try {
          const job = await getDownload(id)
          if (cancelled.current) return
          if (TERMINAL_STATUSES.has(job.status)) {
            if (job.status === "completed") {
              notifyTerminal(job)
              stage(job)
              return
            }
            setState((s) => ({
              ...s,
              phase: "error",
              job,
              error: job.error,
            }))
            notifyTerminal(job)
            return
          }
          setState((s) => ({ ...s, phase: "active", job, error: null }))
          pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS)
        } catch (err) {
          if (cancelled.current) return
          const msg = err instanceof ApiError ? err.message : "lost connection"
          setState((s) => ({ ...s, phase: "error", error: msg }))
        }
      }
      tick()
    },
    [stage],
  )

  const probe = useCallback(
    async (url: string) => {
      cancelled.current = false
      stopPolling()
      cancelStaging()
      disposeShare()
      setState({
        phase: "probing",
        url,
        probe: null,
        job: null,
        error: null,
        share: null,
      })
      try {
        const probe = await probeDownload(url)
        if (cancelled.current) return
        setState({
          phase: "picking",
          url,
          probe,
          job: null,
          error: null,
          share: null,
        })
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "couldn't reach the backend (is it running on :8000?)"
        setState({
          phase: "error",
          url,
          probe: null,
          job: null,
          error: msg,
          share: null,
        })
      }
    },
    [stopPolling, cancelStaging, disposeShare],
  )

  const pick = useCallback(
    async (opts: { format?: DownloadFormat; formatId?: string } = {}) => {
      cancelled.current = false
      // Ask for notification permission on the user gesture so iOS allows it.
      void ensureNotificationPermission()
      setState((s) => ({ ...s, phase: "submitting", error: null }))
      try {
        const url = await getCurrentUrl(setState)
        if (!url) return
        const job = await createDownload(url, opts)
        if (cancelled.current) return
        setState((s) => ({
          ...s,
          phase: "active",
          job,
          error: null,
          share: null,
        }))
        poll(job.id)
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : "couldn't start download"
        setState((s) => ({ ...s, phase: "error", error: msg }))
      }
    },
    [poll],
  )

  const back = useCallback(() => {
    cancelled.current = true
    stopPolling()
    cancelStaging()
    disposeShare()
    setState((s) =>
      s.probe
        ? { ...s, phase: "picking", job: null, error: null, share: null }
        : INITIAL,
    )
  }, [stopPolling, cancelStaging, disposeShare])

  return { state, probe, pick, back, reset }
}

/* Notifications — fire only if the tab isn't visible (in-tab UI already
   conveys completion); requires permission. iOS Safari only honours these
   when the PWA is installed to the home screen. */
function notifyTerminal(job: JobResponse) {
  if (typeof window === "undefined") return
  if (!("Notification" in window)) return
  if (document.visibilityState === "visible") return
  if (Notification.permission !== "granted") return

  const ok = job.status === "completed"
  const title = ok ? "媽下載器 · ready" : "媽下載器 · failed"
  const body = ok
    ? job.title
      ? `${job.title} — tap to save`
      : "your video is ready to save"
    : (job.error ?? "download failed")

  try {
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `job-${job.id}`,
    })
  } catch {
    /* silently ignore — some browsers throw when called outside a SW */
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window))
    return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false
  const result = await Notification.requestPermission()
  return result === "granted"
}

// Read the latest url from state without re-creating the closure each render.
function getCurrentUrl(
  setState: (fn: (s: DownloadState) => DownloadState) => void,
): Promise<string | null> {
  return new Promise((resolve) => {
    setState((s) => {
      resolve(s.url)
      return s
    })
  })
}
