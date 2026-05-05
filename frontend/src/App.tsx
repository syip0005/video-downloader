import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion, AnimatePresence } from "motion/react"
import {
  fileUrl,
  type DownloadFormat,
  type JobResponse,
  type ProbeFormat,
  type ProbeResponse,
} from "./api"
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
  const [routePhase, setRoutePhase] = useState<"idle" | "busy">("idle")

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    localStorage.setItem("theme", theme)
  }, [theme])

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10 text-[var(--fg)]">
      <div className="absolute inset-0 bg-dots opacity-50" />
      <div
        className="float-y absolute -top-40 -left-40 h-56 w-56 rounded-full bg-bubble blur-3xl opacity-50 dark:opacity-25 sm:-top-24 sm:-left-24 sm:h-72 sm:w-72"
        style={{ ["--rot" as never]: "0deg" }}
      />
      <div
        className="float-y absolute -bottom-44 -right-44 h-60 w-60 rounded-full bg-cyan blur-3xl opacity-40 dark:opacity-20 sm:-bottom-28 sm:-right-20 sm:h-80 sm:w-80"
        style={{ ["--rot" as never]: "0deg", animationDelay: "1.6s" }}
      />

      <ThemeToggle
        theme={theme}
        onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />

      <Hero onPhaseChange={setRoutePhase} />
      {routePhase === "idle" ? <PwaHint /> : null}
      <MiloCameo />
    </main>
  )
}

/* -------------------------------------------------------------------------- */

function Hero({
  onPhaseChange,
}: {
  onPhaseChange: (p: "idle" | "busy") => void
}) {
  const { state, probe, pick, back, reset } = useDownload()

  useEffect(() => {
    onPhaseChange(state.phase === "idle" ? "idle" : "busy")
  }, [state.phase, onPhaseChange])

  // Web Share Target: if launched via a share, the URL arrives in ?url= or
  // ?text= (iOS sometimes only fills text). Auto-probe and clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const candidate = params.get("url") ?? params.get("text") ?? ""
    const match = candidate.match(/https?:\/\/\S+/i)
    if (match) {
      probe(match[0])
      window.history.replaceState({}, "", window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 w-full max-w-2xl text-center"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-hot" />
        mum's downloader · est. 2026
      </span>

      <h1
        lang="zh-Hant"
        style={{ fontFamily: "var(--font-tc)" }}
        className="mt-7 text-6xl font-black leading-[0.95] tracking-[-0.02em] sm:text-7xl"
      >
        媽<span className="text-rainbow">下載</span>器
      </h1>

      <p className="mt-3 text-[15px] font-medium uppercase tracking-[0.32em] text-[var(--muted)]">
        mum's downloader
      </p>

      <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-[var(--muted)]">
        paste a link, keep the video.
        <br />
        <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
          媽，下載條片啦，加油！
        </span>
      </p>

      <div className="mx-auto mt-9 w-full sm:max-w-2xl">
        <AnimatePresence mode="wait" initial={false}>
          {state.phase === "idle" || state.phase === "probing" ? (
            <Stage key="form">
              <PasteForm
                submitting={state.phase === "probing"}
                onSubmit={probe}
              />
            </Stage>
          ) : state.phase === "picking" || state.phase === "submitting" ? (
            <Stage key="picker">
              <FormatPicker
                probe={state.probe!}
                submitting={state.phase === "submitting"}
                onPick={pick}
                onBack={reset}
              />
            </Stage>
          ) : (
            <Stage key="job">
              <JobPanel
                state={state}
                onReset={reset}
                onPickAgain={state.probe ? back : undefined}
              />
            </Stage>
          )}
        </AnimatePresence>
      </div>

    </motion.section>
  )
}

function Stage({
  children,
  ...rest
}: React.PropsWithChildren<Record<string, unknown>>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      {...rest}
    >
      {children}
    </motion.div>
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
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  const trimmed = url.trim()
  const valid = /^https?:\/\/\S+/i.test(trimmed)

  const isSecure =
    typeof window !== "undefined" && window.isSecureContext === true
  const canReadClipboard =
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.readText === "function" &&
    isSecure

  const handlePasteAndGo = async () => {
    if (submitting) return
    setPasteHint(null)
    try {
      const text = (await navigator.clipboard.readText()).trim()
      const match = text.match(/https?:\/\/\S+/i)
      if (!match) {
        setPasteHint("clipboard has no link")
        return
      }
      setUrl(match[0])
      onSubmit(match[0])
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === "NotAllowedError") {
        setPasteHint("clipboard permission blocked")
      } else {
        setPasteHint("couldn't read clipboard — paste manually")
      }
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && !submitting) onSubmit(trimmed)
        }}
        className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2"
        style={{
          boxShadow:
            "0 1px 0 0 rgba(26,21,48,0.04), 0 16px 40px -16px rgba(26,21,48,0.35)",
        }}
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
          className="w-full bg-transparent px-3 py-3 font-mono text-lg tracking-tight outline-none placeholder:text-[var(--subtle)] disabled:opacity-60"
        />
        <motion.button
          whileHover={reduce || !valid || submitting ? undefined : { y: -1 }}
          whileTap={reduce || !valid || submitting ? undefined : { y: 1 }}
          type="submit"
          disabled={!valid || submitting}
          className="shrink-0 rounded-xl bg-[var(--fg)] px-5 py-3 text-base font-semibold text-[var(--bg)] transition hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? (
            <Spinner />
          ) : (
            <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
              找一找 →
            </span>
          )}
        </motion.button>
      </form>

      {canReadClipboard ? (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
          <button
            type="button"
            onClick={handlePasteAndGo}
            disabled={submitting}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)]/70 px-3 py-1.5 font-medium text-[var(--fg)] backdrop-blur transition hover:bg-[var(--bg)] disabled:opacity-40"
          >
            ⎘ paste &amp; go
          </button>
          {pasteHint ? (
            <span className="text-hot">{pasteHint}</span>
          ) : (
            <span className="text-[var(--subtle)]">use what's in your clipboard</span>
          )}
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

interface PickerOption {
  key: string
  label: string
  detail: string
  size: number | null
  formatId?: string
  format?: DownloadFormat
  recommended?: boolean
}

function FormatPicker({
  probe,
  submitting,
  onPick,
  onBack,
}: {
  probe: ProbeResponse
  submitting: boolean
  onPick: (opts: { format?: DownloadFormat; formatId?: string }) => void
  onBack: () => void
}) {
  const groups = useMemo(() => groupFormats(probe.formats), [probe.formats])
  const reduce = useReducedMotion()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-left"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <header className="flex items-center gap-3 p-3">
        <Thumb thumbnail={probe.thumbnail} title={probe.title} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 break-words text-sm font-semibold">
            {probe.title ?? "untitled"}
          </div>
          <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--subtle)]">
            {probe.duration ? formatDuration(probe.duration) : "—"}
          </div>
        </div>
      </header>

      {/* Primary CTA — defaults to mp4_720p so it lands cleanly in iOS Photos */}
      <div className="px-3 pb-3">
        <motion.button
          whileHover={reduce || submitting ? undefined : { y: -1 }}
          whileTap={reduce || submitting ? undefined : { y: 1 }}
          onClick={() => onPick({ format: "mp4_720p" })}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--fg)] px-4 py-3.5 text-base font-semibold text-[var(--bg)] transition hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? (
            <Spinner />
          ) : (
            <>
              <span>★</span>
              <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
                下載
              </span>
              <span>· 720p mp4</span>
            </>
          )}
        </motion.button>
        <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--subtle)]">
          saves cleanly to Photos · ios-friendly
        </p>
      </div>

      {/* Advanced disclosure */}
      <div className="border-t border-[var(--border)]">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          disabled={submitting}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--bg)] disabled:opacity-40"
          aria-expanded={advancedOpen}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            advanced · pick a format
          </span>
          <motion.span
            animate={{ rotate: advancedOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-[var(--subtle)]"
          >
            ▾
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {advancedOpen ? (
            <motion.div
              key="advanced"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div
                className="overflow-y-auto border-t border-[var(--border)]"
                style={{
                  maxHeight: "min(50vh, 360px)",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior: "contain",
                }}
              >
                {groups.video.length > 0 ? (
                  <PickerSection title="video">
                    {groups.video.map((opt) => (
                      <PickerRow
                        key={opt.key}
                        label={opt.label}
                        detail={opt.detail}
                        size={opt.size}
                        recommended={opt.recommended}
                        disabled={submitting}
                        onClick={() => onPick({ formatId: opt.formatId })}
                      />
                    ))}
                  </PickerSection>
                ) : null}

                {groups.audio.length > 0 ? (
                  <PickerSection title="audio only">
                    {groups.audio.map((opt) => (
                      <PickerRow
                        key={opt.key}
                        label={opt.label}
                        detail={opt.detail}
                        size={opt.size}
                        disabled={submitting}
                        onClick={() => onPick({ formatId: opt.formatId })}
                      />
                    ))}
                  </PickerSection>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--subtle)]">
          {submitting ? "starting…" : `${probe.formats.length} formats`}
        </span>
        <button
          onClick={onBack}
          disabled={submitting}
          className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--bg)] disabled:opacity-40"
        >
          ← new{" "}
          <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
            連結
          </span>
        </button>
      </footer>
    </div>
  )
}

function PickerSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-[var(--border)]">
      <div className="px-3 pt-3 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--subtle)]">
        {title}
      </div>
      {children}
    </div>
  )
}

function PickerRow({
  label,
  detail,
  size,
  accent,
  recommended,
  disabled,
  onClick,
}: {
  label: string
  detail?: string
  size?: number | null
  accent?: string
  recommended?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-[var(--bg)] disabled:opacity-40 ${
        recommended ? "bg-mint/15" : ""
      }`}
    >
      {accent ? (
        <span className={`h-2 w-2 shrink-0 rounded-full ${accent}`} />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          {recommended ? (
            <span className="shrink-0 rounded-full bg-mint px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink">
              ios
            </span>
          ) : null}
        </div>
        {detail ? (
          <div className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--subtle)]">
            {detail}
          </div>
        ) : null}
      </div>
      {size != null ? (
        <span className="shrink-0 font-mono text-[11px] text-[var(--muted)]">
          {formatBytes(size)}
        </span>
      ) : null}
      <span className="shrink-0 text-[var(--subtle)]">→</span>
    </button>
  )
}

/* Format grouping --------------------------------------------------------- */

function groupFormats(formats: ProbeFormat[]): {
  video: PickerOption[]
  audio: PickerOption[]
} {
  const videoCandidates = formats.filter((f) => f.has_video)
  const audioCandidates = formats.filter((f) => !f.has_video && f.has_audio)

  // Dedupe video by height — keep largest filesize per height bucket.
  const byHeight = new Map<number, ProbeFormat>()
  for (const f of videoCandidates) {
    const h = f.height ?? 0
    const existing = byHeight.get(h)
    const size = effectiveSize(f) ?? 0
    const existingSize = existing ? effectiveSize(existing) ?? 0 : -1
    if (!existing || size > existingSize) byHeight.set(h, f)
  }

  const sortedVideo = [...byHeight.values()].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0),
  )

  // Tag the format closest to 720p (and ext=mp4 if possible) as recommended,
  // since that's what saves to iOS Photos cleanly. Search for an mp4 first;
  // fall back to whatever sits at <=720p.
  const targetMp4 = sortedVideo.find(
    (f) => f.ext === "mp4" && (f.height ?? 0) <= 720,
  )
  const target = targetMp4 ?? sortedVideo.find((f) => (f.height ?? 0) <= 720)

  const video: PickerOption[] = sortedVideo.map((f) => ({
    key: f.format_id,
    label: f.height ? `${f.height}p` : f.resolution ?? f.ext,
    detail: [f.ext, f.fps ? `${f.fps}fps` : null, f.format_note]
      .filter(Boolean)
      .join(" · "),
    size: effectiveSize(f),
    formatId: f.format_id,
    recommended: target ? f.format_id === target.format_id : false,
  }))

  // Dedupe audio by abr bucket, sorted desc.
  const byAbr = new Map<number, ProbeFormat>()
  for (const f of audioCandidates) {
    const k = Math.round((f.abr ?? f.tbr ?? 0) / 16) * 16
    const existing = byAbr.get(k)
    const size = effectiveSize(f) ?? 0
    const existingSize = existing ? effectiveSize(existing) ?? 0 : -1
    if (!existing || size > existingSize) byAbr.set(k, f)
  }

  const audio: PickerOption[] = [...byAbr.values()]
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))
    .map((f) => ({
      key: f.format_id,
      label: f.abr ? `${Math.round(f.abr)} kbps` : f.ext,
      detail: [f.ext, f.format_note].filter(Boolean).join(" · "),
      size: effectiveSize(f),
      formatId: f.format_id,
    }))

  return { video, audio }
}

function effectiveSize(f: ProbeFormat): number | null {
  return f.filesize ?? f.filesize_approx ?? null
}

/* -------------------------------------------------------------------------- */

function JobPanel({
  state,
  onReset,
  onPickAgain,
}: {
  state: ReturnType<typeof useDownload>["state"]
  onReset: () => void
  onPickAgain?: () => void
}) {
  const { phase, job, error, probe } = state
  const progressPct = Math.round(((job?.progress ?? 0) as number) * 100)

  const title = job?.title ?? probe?.title ?? null
  const thumb = job?.thumbnail ?? probe?.thumbnail ?? null

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-left"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="flex items-center gap-3 p-3">
        <Thumb thumbnail={thumb} title={title} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 break-words text-sm font-semibold">
            {title ?? (phase === "error" ? "couldn't start" : "fetching info…")}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--subtle)]">
            <StatusDot phase={phase} status={job?.status} />
            <span>{statusLabel(phase, job?.status)}</span>
            {job?.format_id ? <span>· {job.format_id}</span> : null}
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
          <SaveButton job={job} />
        ) : phase === "error" ? (
          <span className="flex-1 truncate text-xs text-hot">
            {error ?? "something went wrong"}
          </span>
        ) : (
          <span className="flex-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--subtle)]">
            {progressPct}% · please wait
          </span>
        )}
        {onPickAgain && (phase === "done" || phase === "error") ? (
          <button
            onClick={onPickAgain}
            className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--bg)]"
          >
            pick again
          </button>
        ) : null}
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

function Thumb({
  thumbnail,
  title,
}: {
  thumbnail: string | null
  title?: string | null
}) {
  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt={title ?? ""}
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
  if (phase === "submitting") return "starting"
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

function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
  return `${m}:${sec.toString().padStart(2, "0")}`
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

/* -------------------------------------------------------------------------- */
/* Save button — plain anchor download. Backend sends                         */
/* Content-Disposition: attachment, so iOS shows its native download tray and */
/* the file lands in the Files app in ~1s. For "save to Photos" we follow     */
/* cobalt.tools' approach: link to a one-tap iCloud Shortcut (installed once, */
/* then appears in the iOS Files share sheet). There's no clean web API for   */
/* writing to the Photo Library; navigator.share({files}) is too slow and     */
/* unreliable to use as a default path.                                       */

const IOS_SAVE_TO_PHOTOS_SHORTCUT =
  "https://www.icloud.com/shortcuts/14e9aebf04b24156acc34ceccf7e6fcd"

function SaveButton({ job }: { job: JobResponse }) {
  const isIos =
    typeof window !== "undefined" &&
    /iphone|ipad|ipod/i.test(window.navigator.userAgent)

  if (isIos) return <IosShareButton job={job} />

  return (
    <div className="flex-1">
      <a
        href={fileUrl(job.id)}
        download={job.filename ?? undefined}
        className="block rounded-xl bg-[var(--fg)] px-4 py-2.5 text-center text-sm font-medium text-[var(--bg)] transition hover:opacity-90"
      >
        ★ save{" "}
        <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
          影片
        </span>
      </a>
      <IosPhotosHint />
    </div>
  )
}

/* iOS uses navigator.share({ files }) — same path cobalt.tools uses for     */
/* local Files. Pre-fetches the finished file as a Blob in the background;   */
/* on click calls navigator.share synchronously so iOS retains the user-     */
/* activation gesture. iOS' share sheet then offers Save Video, Save to      */
/* Files, AirDrop, Messages, and any installed Siri Shortcuts that accept    */
/* video — which is how the cobalt "Save to Photos" shortcut becomes a       */
/* one-tap destination once the user installs it.                            */

type ShareReadyState = "preparing" | "ready" | "sharing" | "no-share"

// Pre-fetch + file-share gate. iOS holds the entire blob in tab RAM for the
// share IPC; above ~256 MB it frequently OOMs the tab. 512 MB is the upper
// limit we'll attempt before falling back to the anchor download.
const IOS_SHARE_MAX_BYTES = 512 * 1024 * 1024

// Map common containers to MIME types so iOS resolves the right UTI when
// blob.type comes back empty (rare). Mirrors the server's mimetypes
// guess-table for the formats yt-dlp actually emits.
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

function IosShareButton({ job }: { job: JobResponse }) {
  const fileRef = useRef<File | null>(null)
  const tooBig =
    typeof job.filesize === "number" && job.filesize > IOS_SHARE_MAX_BYTES
  const [state, setState] = useState<ShareReadyState>(() => {
    if (tooBig) return "no-share"
    return typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function"
      ? "preparing"
      : "no-share"
  })

  useEffect(() => {
    if (state !== "preparing") return
    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(fileUrl(job.id), { signal: ac.signal })
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
        const blob = await res.blob()
        const filename = job.filename ?? "video.mp4"
        // Match cobalt: MIME must reflect the actual container so iOS maps
        // the file to the correct UTI and surfaces Photos / our Shortcut as
        // share-sheet destinations. Trust the server's Content-Type first
        // (FastAPI fills it via mimetypes.guess_type), then fall back to
        // sniffing the filename extension.
        const type = blob.type || mimeFromFilename(filename)
        const file = new File([blob], filename, { type })
        if (
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] })
        ) {
          fileRef.current = file
          setState("ready")
        } else {
          setState("no-share")
        }
      } catch (err) {
        const name = (err as { name?: string })?.name
        if (name !== "AbortError") setState("no-share")
      }
    })()
    return () => ac.abort()
  }, [state, job.id, job.filename])

  const handleShare = () => {
    if (state === "sharing") {
      // Tap-to-cancel: unstick our UI; iOS keeps its sheet up regardless.
      setState("ready")
      return
    }
    if (state !== "ready" || !fileRef.current) return
    const file = fileRef.current
    setState("sharing")
    // 60s watchdog — share usually settles, but tab backgrounding or Low
    // Power Mode can leave it pending.
    const watchdog = window.setTimeout(() => setState("ready"), 60_000)
    // Match cobalt exactly: { files } only, no title/text/url. The Save-to-
    // Photos Shortcut keys off the file's UTI; extra share-sheet metadata
    // may cause iOS to route the share differently.
    void navigator
      .share({ files: [file] })
      .catch((err) => {
        const name = (err as { name?: string })?.name
        if (name && name !== "AbortError") {
          console.warn("share rejected:", name, err)
        }
      })
      .finally(() => {
        window.clearTimeout(watchdog)
        setState("ready")
      })
  }

  if (state === "no-share") {
    // Browser claims canShare but rejected the file (codec / size). Fall
    // back to the plain anchor download.
    return (
      <div className="flex-1">
        <a
          href={fileUrl(job.id)}
          download={job.filename ?? undefined}
          className="block rounded-xl bg-[var(--fg)] px-4 py-2.5 text-center text-sm font-medium text-[var(--bg)] transition hover:opacity-90"
        >
          ★ save{" "}
          <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
            影片
          </span>
        </a>
        <IosPhotosHint />
      </div>
    )
  }

  const label =
    state === "preparing" ? (
      <span className="inline-flex items-center gap-2 opacity-80">
        <Spinner />
        preparing share…
      </span>
    ) : state === "sharing" ? (
      <span className="inline-flex items-center gap-2">
        <Spinner />
        sharing… tap to cancel
      </span>
    ) : (
      <>
        ⤴ share{" "}
        <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
          影片
        </span>
      </>
    )

  return (
    <div className="flex-1">
      <button
        type="button"
        onClick={handleShare}
        disabled={state === "preparing"}
        className="block w-full rounded-xl bg-[var(--fg)] px-4 py-2.5 text-center text-sm font-medium text-[var(--bg)] transition hover:opacity-90 disabled:opacity-60"
      >
        {label}
      </button>
      <p className="mt-1.5 text-center text-[11px] leading-snug text-[var(--subtle)]">
        opens iOS share sheet · big files take 20–60s
      </p>
      <IosPhotosHint />
    </div>
  )
}

function IosPhotosHint() {
  const [open, setOpen] = useState(false)
  const isIos =
    typeof window !== "undefined" &&
    /iphone|ipad|ipod/i.test(window.navigator.userAgent)

  if (!isIos) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--subtle)] transition hover:text-[var(--muted)]"
      >
        save to Photos on iPhone?
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-[10px]"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="hint"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-left text-xs leading-relaxed text-[var(--muted)]">
              <p className="font-semibold text-[var(--fg)]">one-time setup:</p>
              <a
                href={IOS_SAVE_TO_PHOTOS_SHORTCUT}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center text-[var(--fg)] transition hover:opacity-90"
              >
                ⤓ install "Save to Photos" shortcut →
              </a>
              <p className="mt-3 font-semibold text-[var(--fg)]">then to save a video:</p>
              <ol className="mt-1 list-decimal pl-5">
                <li>
                  tap{" "}
                  <span className="font-medium text-[var(--fg)]">
                    ⤴ share{" "}
                    <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>
                      影片
                    </span>
                  </span>{" "}
                  above
                </li>
                <li>
                  in the share sheet, tap{" "}
                  <span className="font-medium text-[var(--fg)]">Save to Photos</span>{" "}
                  (it appears once installed)
                </li>
              </ol>
              <p className="mt-3 text-[11px] text-[var(--subtle)]">
                shortcut courtesy of{" "}
                <a
                  href="https://cobalt.tools"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  cobalt.tools
                </a>
                . iOS doesn't expose a Web API to write directly to Photos.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* PWA install hint / status — sits at the bottom of the page, dismissible.   */
/* On iOS we deliberately call out that share-target is unsupported because   */
/* WebKit hasn't shipped it; the paste & go button is the iOS substitute.    */

function PwaHint() {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return true
    return localStorage.getItem("pwa-hint-hidden") === "1"
  })

  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari uses a non-standard property
      ("standalone" in window.navigator &&
        (window.navigator as { standalone?: boolean }).standalone === true))

  const isIos =
    typeof window !== "undefined" &&
    /iphone|ipad|ipod/i.test(window.navigator.userAgent)

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem("pwa-hint-hidden", "1")
    } catch {
      /* ignore */
    }
  }

  if (hidden || standalone) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/85 px-3 py-2 text-left text-xs text-[var(--muted)] backdrop-blur sm:bottom-5">
      <div className="min-w-0">
        <div className="font-semibold text-[var(--fg)]">install on your phone</div>
        <div className="mt-0.5 text-[11px] leading-snug">
          {isIos
            ? "tap share → Add to Home Screen. (iOS doesn't list PWAs in the share sheet — use paste & go instead.)"
            : "browser menu → Install app, or tap the install icon in the address bar."}
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="dismiss"
        className="shrink-0 rounded-full border border-[var(--border)] px-2 py-1 text-[var(--muted)] transition hover:bg-[var(--bg)]"
      >
        ✕
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Milo (the dog) cameo — peeks up from the bottom every so often.            */

function MiloCameo() {
  const reduce = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const [side, setSide] = useState<"left" | "right">("right")

  useEffect(() => {
    if (reduce) return
    let timer: number
    const schedulePeek = () => {
      // First peek 25–55s after load, then every 60–120s.
      const delay = visible
        ? 4500 // how long he stays visible before ducking
        : 25000 + Math.random() * 30000
      timer = window.setTimeout(() => {
        if (visible) {
          setVisible(false)
        } else {
          setSide(Math.random() < 0.5 ? "left" : "right")
          setVisible(true)
        }
      }, delay)
    }
    schedulePeek()
    return () => window.clearTimeout(timer)
  }, [visible, reduce])

  if (reduce) return null

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          key="milo"
          onClick={() => setVisible(false)}
          aria-label="say hi to milo"
          initial={{ y: 80, rotate: side === "left" ? -8 : 8, opacity: 0 }}
          animate={{
            y: 0,
            rotate: side === "left" ? -6 : 6,
            opacity: 1,
            transition: { type: "spring", stiffness: 220, damping: 16 },
          }}
          exit={{ y: 90, opacity: 0, transition: { duration: 0.4 } }}
          className={`fixed bottom-0 z-30 ${
            side === "left" ? "left-2 sm:left-6" : "right-2 sm:right-6"
          } pointer-events-auto select-none`}
        >
          <motion.span
            animate={{ rotate: [0, 4, -4, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="block"
          >
            <img
              src="/milo_head.png"
              alt="milo"
              draggable={false}
              className="h-24 w-24 translate-y-3 rounded-t-full object-cover shadow-[0_-6px_24px_-6px_rgba(26,21,48,0.35)] sm:h-28 sm:w-28"
              style={{ objectPosition: "center top" }}
            />
          </motion.span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  )
}
