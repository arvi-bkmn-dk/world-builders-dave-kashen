// Build dave-kashen-knowledge-base.zip from content/ (default: dist/).
// .github/workflows/knowledge-base-download.yml runs it on every push to main
// and attaches the zip to the `knowledge-base` GitHub release, so the download
// link always serves the current published notes. Pure Node (zlib only).
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"

const SRC = "content"
const OUT = process.argv[2] || "dist/dave-kashen-knowledge-base.zip"
const ROOT = "Dave Kashen Knowledge Base"

const README = `# Dave Kashen Knowledge Base

The published work of Dave Kashen, startup CEO coach, broken into linked notes:
teachings, mental models, practices, quotes, his coined vocabulary, the people
he learned from, and the newsletters, podcast episodes, articles and interviews
it all comes from.

Only material Dave has published is included. Every quote is verbatim from a
published source, and every note names the source it came from.

## How to use it

- **Obsidian:** open this folder as a vault (Open folder as vault). The graph
  view is preset to colour notes by type.
- **Anything else:** it's plain Markdown. Links between notes use
  [[wikilinks]].

## Links

- Browse it online: https://dave-kashen-knowledge-base.vercel.app
- Dave Kashen: https://www.davekashen.com
- Newsletter: https://www.davekashen.com/newsletter

All content © Dave Kashen.
`

// Obsidian graph colour groups, matching the website
const colours = {
  Sources: 0x4a90d9,
  Teachings: 0xe05d5d,
  "Mental Models": 0x4caf7a,
  Topics: 0x9b6dd6,
  Quotes: 0xe8a33d,
  Practices: 0x2fb3a8,
  Lexicon: 0xc9b23a,
  "Orgs and Collaborators": 0xd46aa6,
}
const GRAPH = JSON.stringify(
  {
    showTags: false,
    colorGroups: Object.entries(colours).map(([f, rgb]) => ({
      query: `path:"${f}/"`,
      color: { a: 1, rgb },
    })),
  },
  null,
  2,
)

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const entries = [
  ...walk(SRC).sort().map((f) => [path.relative(SRC, f).split(path.sep).join("/"), fs.readFileSync(f)]),
  ["README.md", Buffer.from(README)],
  [".obsidian/graph.json", Buffer.from(GRAPH)],
]

// fixed DOS timestamp (2026-01-01) keeps the archive deterministic
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
const locals = []
const centrals = []
let offset = 0
for (const [rel, data] of entries) {
  const name = Buffer.from(`${ROOT}/${rel}`, "utf8")
  const comp = zlib.deflateRawSync(data, { level: 9 })
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6) // UTF-8 names
  local.writeUInt16LE(8, 8) // deflate
  local.writeUInt16LE(DOS_TIME, 10)
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(comp.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  locals.push(local, name, comp)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(DOS_TIME, 12)
  central.writeUInt16LE(DOS_DATE, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(comp.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(offset, 42)
  centrals.push(central, name)
  offset += 30 + name.length + comp.length
}
const cdSize = centrals.reduce((n, b) => n + b.length, 0)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(entries.length, 8)
end.writeUInt16LE(entries.length, 10)
end.writeUInt32LE(cdSize, 12)
end.writeUInt32LE(offset, 16)

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, Buffer.concat([...locals, ...centrals, end]))
console.log(`[build-download] ${OUT}: ${entries.length} files, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`)
