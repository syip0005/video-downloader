import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

export default function App() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-cream text-ink">
      <BackgroundDecor />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <NavBar />
        <Hero />
        <Marquee />
        <FeatureCards />
        <Footer />
      </div>
    </main>
  )
}

/* -------------------------------------------------------------------------- */

function NavBar() {
  return (
    <header className="px-5 pt-5 sm:px-8 sm:pt-7">
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border-2 border-ink bg-white/85 px-4 py-3 shadow-chunk-sm backdrop-blur sm:px-5">
        <a href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-pixel text-[11px] tracking-tight sm:text-xs">
            tapecase
          </span>
        </a>
        <nav className="hidden items-center gap-1 sm:flex">
          {["how it works", "supports", "faq"].map((label) => (
            <a
              key={label}
              href={`#${label.replace(/\s+/g, "-")}`}
              className="rounded-full px-3 py-1.5 text-sm font-medium transition hover:bg-bubble"
            >
              {label}
            </a>
          ))}
        </nav>
        <a
          href="#paste"
          className="rounded-full border-2 border-ink bg-lemon px-3 py-1.5 text-xs font-bold shadow-chunk-sm transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none sm:px-4 sm:text-sm"
        >
          ★ get it
        </a>
      </div>
    </header>
  )
}

function Logo() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg border-2 border-ink bg-hot text-white shadow-chunk-sm">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M3 6h18v12H3z" opacity=".25" />
        <circle cx="8" cy="12" r="2.4" />
        <circle cx="16" cy="12" r="2.4" />
        <path d="M3 6h18v12H3z" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  )
}

/* -------------------------------------------------------------------------- */

function Hero() {
  const reduce = useReducedMotion()
  const [url, setUrl] = useState("")

  return (
    <section
      id="paste"
      className="relative mx-auto w-full max-w-6xl px-5 pt-10 pb-12 sm:px-8 sm:pt-16 sm:pb-20"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <motion.span
          initial={{ scale: 0.9, rotate: -4, opacity: 0 }}
          animate={{ scale: 1, rotate: -4, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 220, damping: 14 }}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-mint px-3 py-1 font-pixel text-[10px] uppercase shadow-chunk-sm sm:text-[11px]"
        >
          <span className="twinkle">✦</span> est. 2026 — handmade with love
        </motion.span>

        <h1 className="mt-6 font-sans text-5xl font-bold leading-[0.95] tracking-tight sm:text-7xl md:text-8xl">
          <span className="block">paste a link.</span>
          <span className="block">
            keep the{" "}
            <span className="relative inline-block">
              <span className="text-rainbow">video.</span>
              <Sparkle className="absolute -top-3 -right-6 h-7 w-7 text-lemon sm:-top-4 sm:-right-8 sm:h-10 sm:w-10" />
            </span>
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base text-ink/70 sm:text-lg">
          a tiny self-hosted downloader that plays nice with iphones.
          drop a url, hit go, save it to your camera roll. no fuss, just vibes.
        </p>
      </motion.div>

      {/* paste box */}
      <motion.form
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={(e) => e.preventDefault()}
        className="relative mx-auto mt-10 max-w-2xl"
      >
        <div className="absolute -top-3 left-4 z-10 rotate-[-3deg] rounded-md border-2 border-ink bg-cyan px-2 py-0.5 font-pixel text-[9px]">
          ▸ paste here
        </div>
        <div className="relative rounded-2xl border-2 border-ink bg-white shadow-chunk scanlines">
          <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-xl border-2 border-ink bg-cream px-3 py-2.5">
              <span className="font-pixel text-[10px] text-ink/60">URL://</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                inputMode="url"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="youtube.com/watch?v=..."
                className="w-full bg-transparent font-mono text-lg outline-none placeholder:text-ink/35"
              />
            </div>
            <motion.button
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { y: 2, x: 2 }}
              type="submit"
              className="group relative shrink-0 rounded-xl border-2 border-ink bg-hot px-5 py-3 font-pixel text-[11px] text-white shadow-chunk-sm transition active:shadow-none sm:text-xs"
            >
              <span className="relative z-10">▶ download</span>
            </motion.button>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-ink/50">
          works with most sites yt-dlp supports • we don't store anything ✿
        </p>
      </motion.form>

      {/* floating stickers */}
      <FloatingStickers />
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function FloatingStickers() {
  return (
    <>
      <Sticker
        className="left-2 top-32 hidden rotate-[-12deg] bg-grape text-white sm:block"
        delay={0.4}
      >
        ♥ mp4
      </Sticker>
      <Sticker
        className="right-4 top-16 hidden rotate-[8deg] bg-cyan sm:block"
        delay={0.55}
      >
        720p ⌁
      </Sticker>
      <Sticker
        className="left-6 bottom-10 hidden rotate-[6deg] bg-lemon sm:block md:left-16"
        delay={0.7}
      >
        ✿ it's free
      </Sticker>
      <Sticker
        className="right-8 bottom-24 hidden rotate-[-6deg] bg-mint sm:block"
        delay={0.85}
      >
        ✓ ios safari
      </Sticker>
    </>
  )
}

function Sticker({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 220, damping: 14 }}
      className={`absolute z-0 select-none rounded-full border-2 border-ink px-3 py-1 font-pixel text-[10px] shadow-chunk-sm ${className}`}
    >
      <span className="float-y inline-block">{children}</span>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */

function Marquee() {
  const items = [
    "youtube",
    "✦",
    "tiktok",
    "✿",
    "instagram",
    "★",
    "twitter / x",
    "♥",
    "vimeo",
    "✦",
    "twitch clips",
    "✿",
    "reddit",
    "★",
    "soundcloud",
    "♥",
  ]
  const row = [...items, ...items]
  return (
    <div className="relative -mt-2 mb-8 border-y-2 border-ink bg-ink py-3 text-cream">
      <div className="marquee-track flex gap-10 whitespace-nowrap font-pixel text-xs uppercase">
        {row.map((s, i) => (
          <span key={i} className="shrink-0">
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

const FEATURES = [
  {
    title: "paste & poof",
    body: "drop any video link. we fetch it, you save it. that's the whole loop.",
    bg: "bg-bubble",
    emoji: "✿",
  },
  {
    title: "iphone-friendly",
    body: "designed mobile-first. taps the 'save to files' sheet so it lands where you expect.",
    bg: "bg-mint",
    emoji: "❤︎",
  },
  {
    title: "self-hosted",
    body: "your box, your rules. no ads, no trackers, no nonsense.",
    bg: "bg-cyan",
    emoji: "★",
  },
] as const

function FeatureCards() {
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24"
    >
      <h2 className="mb-8 text-center font-pixel text-[11px] uppercase text-ink/70 sm:text-xs">
        ◤ three reasons to like this thing ◥
      </h2>
      <div className="grid gap-5 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4, rotate: i % 2 === 0 ? -1 : 1 }}
            className={`relative rounded-2xl border-2 border-ink p-5 shadow-chunk ${f.bg}`}
          >
            <div className="absolute -top-3 -right-3 grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-white text-lg shadow-chunk-sm">
              {f.emoji}
            </div>
            <div className="font-pixel text-[10px] text-ink/50">0{i + 1}</div>
            <h3 className="mt-2 text-2xl font-bold tracking-tight">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/75">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="mt-auto border-t-2 border-ink bg-white/60 px-5 py-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-xs text-ink/60 sm:flex-row">
        <span className="font-pixel text-[10px]">© 2026 tapecase</span>
        <span>made with ♥, yt-dlp & a healthy disrespect for flat design</span>
      </div>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */

function BackgroundDecor() {
  return (
    <>
      <div className="absolute inset-0 bg-dots" />
      {/* soft color blobs */}
      <div
        className="float-y absolute -top-24 -left-24 h-72 w-72 rounded-full bg-bubble blur-3xl opacity-60"
        style={{ ["--rot" as never]: "0deg" }}
      />
      <div
        className="float-y absolute -top-10 right-[-6rem] h-80 w-80 rounded-full bg-cyan blur-3xl opacity-50"
        style={{ ["--rot" as never]: "0deg", animationDelay: "1.4s" }}
      />
      <div
        className="float-y absolute bottom-[-8rem] left-1/3 h-80 w-80 rounded-full bg-lemon blur-3xl opacity-50"
        style={{ ["--rot" as never]: "0deg", animationDelay: "2.8s" }}
      />

      {/* twinkling stars */}
      {STARS.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="twinkle absolute font-pixel text-ink/40"
          style={{
            top: s.top,
            left: s.left,
            fontSize: s.size,
            animationDelay: `${s.delay}s`,
          }}
        >
          ✦
        </span>
      ))}
    </>
  )
}

const STARS = [
  { top: "12%", left: "8%", size: "14px", delay: 0 },
  { top: "22%", left: "92%", size: "10px", delay: 0.6 },
  { top: "44%", left: "4%", size: "12px", delay: 1.1 },
  { top: "60%", left: "96%", size: "16px", delay: 0.3 },
  { top: "78%", left: "12%", size: "10px", delay: 1.8 },
  { top: "88%", left: "82%", size: "14px", delay: 0.9 },
  { top: "32%", left: "50%", size: "8px", delay: 2.1 },
]

/* -------------------------------------------------------------------------- */

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      animate={{ rotate: [0, 18, -10, 0], scale: [1, 1.15, 1] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <path d="M12 1l2.39 7.61L22 11l-7.61 2.39L12 21l-2.39-7.61L2 11l7.61-2.39z" />
    </motion.svg>
  )
}
