import { useEffect, useState } from "react"
import { motion, useReducedMotion, AnimatePresence } from "motion/react"
import { fileUrl, type JobResponse } from "./api"
import { useDownload } from "./useDownload"

type Theme = "light" | "dark"

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light"
  const stored = localStorage.getItem("theme") as Theme | null
  if (stored === "light" || stored === "dark") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    localStorage.setItem("theme", theme)
  }, [theme])

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 text-[var(--fg)]">
      <div className="absolute inset-0 bg-dots opacity-50" />
      <div
        className="float-y absolute -top-24 -left-24 h-72 w-72 rounded-full bg-bubble blur-3xl opacity-50 dark:opacity-25"
        style={{ ["--rot" as never]: "0deg" }}
      />
      <div
        className="float-y absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-cyan blur-3xl opacity-40 dark:opacity-20"
        style={{ ["--rot" as never]: "0deg", animationDelay: "1.6s" }}
      />

      <ThemeToggle
        theme={theme}
        onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />

      <Hero />
    </main>
  )
}

/* -------------------------------------------------------------------------- */

function Hero() {
  const { state, submit, reset } = useDownload()

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 w-full max-w-md text-center"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-hot" />
        mum's downloader · est. 2026
      </span>

      <h1
        lang="zh-Hant"
        style={{ fontFamily: "var(--font-tc)" }}
        className="mt-7 text-7xl font-black leading-[0.95] tracking-[-0.02em] sm:text-8xl"
      >
        媽<span className="text-rainbow">下載</span>器
      </h1>

      <p className="mt-3 text-[15px] font-medium uppercase tracking-[0.32em] text-[var(--muted)]">
        mum's downloader
      </p>

      <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-[var(--muted)]">
        paste a link, keep the video. a tiny self-hosted downloader 媽 would
        actually use.
      </p>

      <div className="mt-9">
        <AnimatePresence mode="wait" initial={false}>
          {state.phase === "idle" || state.phase === "submitting" ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <PasteForm
                submitting={state.phase === "submitting"}
                onSubmit={submit}
              />
            </motion.div>
          ) : (
            <motion.div
              key="job"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <JobPanel state={state} onReset={reset} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--subtle)]">
        yt-dlp · 自家託管 · ios-friendly
      </p>
    </motion.section>
  )
}

/* -------------------------------------------------------------------------- */

function PasteForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean
  onSubmit: (url: string) => void
}) {
  const reduce = useReducedMotion()
  const [url, setUrl] = useState("")
  const trimmed = url.trim()
  const valid = /^https?:\/\/\S+/i.test(trimmed)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && !submitting) onSubmit(trimmed)
      }}
      className="flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        inputMode="url"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={submitting}
        placeholder="https://..."
        className="w-full bg-transparent px-3 py-2.5 font-mono text-base tracking-tight outline-none placeholder:text-[var(--subtle)] disabled:opacity-60"
      />
      <motion.button
        whileHover={reduce || !valid || submitting ? undefined : { y: -1 }}
        whileTap={reduce || !valid || submitting ? undefined : { y: 1 }}
        type="submit"
        disabled={!valid || submitting}
        className="shrink-0 rounded-xl bg-[var(--fg)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] transition hover:opacity-90 disabled:opacity-40"
      >
        {submitting ? (
          <Spinner />
        ) : (
          <>
            <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
              下載
            </span>
            <span className="ml-1.5">→</span>
          </>
        )}
      </motion.button>
    </form>
  )
}

/* -------------------------------------------------------------------------- */

function JobPanel({
  state,
  onReset,
}: {
  state: ReturnType<typeof useDownload>["state"]
  onReset: () => void
}) {
  const { phase, job, error } = state
  const progressPct = Math.round(((job?.progress ?? 0) as number) * 100)

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-left"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="flex items-center gap-3 p-3">
        <Thumb job={job} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {job?.title ?? (phase === "error" ? "couldn't start" : "fetching info…")}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--subtle)]">
            <StatusDot phase={phase} status={job?.status} />
            <span>{statusLabel(phase, job?.status)}</span>
            {job?.filesize ? <span>· {formatBytes(job.filesize)}</span> : null}
          </div>
        </div>
      </div>

      <ProgressBar
        pct={phase === "done" ? 100 : progressPct}
        active={phase === "active"}
        failed={phase === "error"}
        done={phase === "done"}
      />

      <div className="flex items-center justify-between gap-2 p-3">
        {phase === "done" && job ? (
          <a
            href={fileUrl(job.id)}
            download={job.filename ?? undefined}
            className="flex-1 rounded-xl bg-[var(--fg)] px-4 py-2.5 text-center text-sm font-medium text-[var(--bg)] transition hover:opacity-90"
          >
            ★ save{" "}
            <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
              影片
            </span>
          </a>
        ) : phase === "error" ? (
          <span className="flex-1 truncate text-xs text-hot">
            {error ?? "something went wrong"}
          </span>
        ) : (
          <span className="flex-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--subtle)]">
            {progressPct}% · please wait
          </span>
        )}
        <button
          onClick={onReset}
          className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--bg)]"
        >
          {phase === "done" || phase === "error" ? (
            <>
              new{" "}
              <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
                連結
              </span>
            </>
          ) : (
            "cancel"
          )}
        </button>
      </div>
    </div>
  )
}

function Thumb({ job }: { job: JobResponse | null }) {
  if (job?.thumbnail) {
    return (
      <img
        src={job.thumbnail}
        alt=""
        className="h-12 w-12 shrink-0 rounded-lg border border-[var(--border)] object-cover"
      />
    )
  }
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] text-base">
      <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
        媽
      </span>
    </div>
  )
}

function ProgressBar({
  pct,
  active,
  failed,
  done,
}: {
  pct: number
  active: boolean
  failed: boolean
  done: boolean
}) {
  const fill = failed ? "bg-hot" : done ? "bg-mint" : "bg-cyan"
  return (
    <div className="px-3">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <motion.div
          className={`h-full rounded-full ${fill}`}
          initial={false}
          animate={{ width: `${Math.max(2, pct)}%` }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
        {active ? (
          <motion.div
            className="absolute inset-y-0 w-1/3 bg-white/30 mix-blend-overlay"
            initial={{ x: "-100%" }}
            animate={{ x: "300%" }}
            transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
          />
        ) : null}
      </div>
    </div>
  )
}

function StatusDot({
  phase,
  status,
}: {
  phase: string
  status?: JobResponse["status"]
}) {
  const cls =
    phase === "done"
      ? "bg-mint"
      : phase === "error"
      ? "bg-hot"
      : status === "downloading"
      ? "bg-cyan"
      : "bg-lemon"
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span
        className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${cls} ${
          phase === "active" ? "animate-ping" : ""
        }`}
      />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${cls}`} />
    </span>
  )
}

function statusLabel(phase: string, status?: JobResponse["status"]): string {
  if (phase === "submitting") return "submitting"
  if (phase === "done") return "ready"
  if (phase === "error") return "failed"
  if (status === "queued") return "queued"
  if (status === "downloading") return "downloading"
  return "working"
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/* -------------------------------------------------------------------------- */

function Spinner() {
  return (
    <motion.span
      aria-label="loading"
      className="inline-block h-4 w-4 rounded-full border-2 border-[var(--bg)]/30 border-t-[var(--bg)]"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, ease: "linear", repeat: Infinity }}
    />
  )
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      className="absolute right-5 top-5 z-20 grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]/70 text-[var(--fg)] backdrop-blur transition hover:scale-105 active:scale-95"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: -14, opacity: 0, rotate: -30 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: 14, opacity: 0, rotate: 30 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="text-base leading-none"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
