import { useCallback, useEffect, useRef, useState } from "react"
import {
  ApiError,
  createDownload,
  getDownload,
  TERMINAL_STATUSES,
  type DownloadFormat,
  type JobResponse,
} from "./api"

const POLL_INTERVAL_MS = 1000

export type DownloadPhase = "idle" | "submitting" | "active" | "done" | "error"

export interface DownloadState {
  phase: DownloadPhase
  job: JobResponse | null
  error: string | null
}

const INITIAL: DownloadState = { phase: "idle", job: null, error: null }

export function useDownload() {
  const [state, setState] = useState<DownloadState>(INITIAL)
  const pollTimer = useRef<number | null>(null)
  const cancelled = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cancelled.current = true
    stopPolling()
    setState(INITIAL)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  const poll = useCallback(
    (id: string) => {
      const tick = async () => {
        try {
          const job = await getDownload(id)
          if (cancelled.current) return
          if (TERMINAL_STATUSES.has(job.status)) {
            setState({
              phase: job.status === "completed" ? "done" : "error",
              job,
              error: job.error,
            })
            return
          }
          setState({ phase: "active", job, error: null })
          pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS)
        } catch (err) {
          if (cancelled.current) return
          const msg = err instanceof ApiError ? err.message : "lost connection"
          setState((s) => ({ phase: "error", job: s.job, error: msg }))
        }
      }
      tick()
    },
    [],
  )

  const submit = useCallback(
    async (url: string, format: DownloadFormat = "best") => {
      cancelled.current = false
      stopPolling()
      setState({ phase: "submitting", job: null, error: null })
      try {
        const job = await createDownload(url, format)
        if (cancelled.current) return
        setState({ phase: "active", job, error: null })
        poll(job.id)
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "couldn't reach the backend (is it running on :8000?)"
        setState({ phase: "error", job: null, error: msg })
      }
    },
    [poll, stopPolling],
  )

  return { state, submit, reset }
}
