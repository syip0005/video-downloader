import { useEffect, useState } from "react"
import { motion, useReducedMotion, AnimatePresence } from "motion/react"

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
  const reduce = useReducedMotion()
  const [url, setUrl] = useState("")
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

        <form
          onSubmit={(e) => e.preventDefault()}
          className="mt-9 flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5"
          style={{ boxShadow: "var(--shadow-ambient)" }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://..."
            className="w-full bg-transparent px-3 py-2.5 font-mono text-base tracking-tight outline-none placeholder:text-[var(--subtle)]"
          />
          <motion.button
            whileHover={reduce ? undefined : { y: -1 }}
            whileTap={reduce ? undefined : { y: 1 }}
            type="submit"
            className="shrink-0 rounded-xl bg-[var(--fg)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] transition hover:opacity-90"
          >
            <span lang="zh-Hant" style={{ fontFamily: "var(--font-tc)" }}>下載</span>
            <span className="ml-1.5">→</span>
          </motion.button>
        </form>

        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--subtle)]">
          yt-dlp · 自家託管 · ios-friendly
        </p>
      </motion.section>
    </main>
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
