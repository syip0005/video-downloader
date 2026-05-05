import sharp from "sharp"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")
const svg = readFileSync(resolve(root, "public/icon.svg"))

const targets = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 32, name: "favicon-32.png" },
]

for (const { size, name } of targets) {
  const out = resolve(root, "public", name)
  const buf = await sharp(svg).resize(size, size).png().toBuffer()
  writeFileSync(out, buf)
  console.log(`✓ ${name} (${size}x${size})`)
}

// maskable: pad with safe zone (icon at ~80% of canvas)
const inner = await sharp(svg).resize(410, 410).png().toBuffer()
const maskable = await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 255, g: 79, b: 163, alpha: 1 },
  },
})
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toBuffer()
writeFileSync(resolve(root, "public/icon-maskable-512.png"), maskable)
console.log("✓ icon-maskable-512.png (512x512)")
