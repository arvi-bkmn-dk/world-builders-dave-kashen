// Patches @quartz-community/graph after every `npm install` (wired as postinstall).
//   1. Colour nodes by note type, like Obsidian's graph colour groups. The
//      plugin only colours current / visited / other.
//   2. Clear the container right before attaching a canvas. Two renders that
//      overlap (page load + nav event) otherwise stack two canvases, and the
//      second spills out below the graph box over the page text.
// The build bundles dist/components/index.js, so both bundles are patched.
// Fails loudly if the plugin changes and a target is no longer there.
import fs from "node:fs"

const files = [
  "node_modules/@quartz-community/graph/dist/index.js",
  "node_modules/@quartz-community/graph/dist/components/index.js",
]

const colours = {
  sources: "#4a90d9",
  teachings: "#e05d5d",
  "mental-models": "#4caf7a",
  topics: "#9b6dd6",
  quotes: "#e8a33d",
  practices: "#2fb3a8",
  lexicon: "#c9b23a",
  "orgs-and-collaborators": "#d46aa6",
}

const patches = [
  {
    name: "node colours by type",
    mark: "/*type-colours*/",
    target:
      'function $e(i){var l=i.id===g;return l?Ie:K.has(i.id)||i.id.startsWith("tags/")?Qu:ue}',
    replacement:
      `/*type-colours*/function $e(i){if(i.id===g)return Ie;var m=${JSON.stringify(colours)};` +
      `var f=i.id.split("/")[0];return m[f]||ue}`,
  },
  {
    name: "one canvas per container",
    mark: "/*one-canvas*/",
    target: "_.appendChild(Q.canvas)",
    replacement: "/*one-canvas*/ke(_),_.appendChild(Q.canvas)",
  },
]

let failed = false
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`[patch-graph] ${file} not installed, skipping`)
    continue
  }
  let src = fs.readFileSync(file, "utf8")
  for (const p of patches) {
    if (src.includes(p.mark)) {
      console.log(`[patch-graph] ${file}: ${p.name} already applied`)
    } else if (src.includes(p.target)) {
      src = src.replace(p.target, p.replacement)
      console.log(`[patch-graph] ${file}: ${p.name} applied`)
    } else {
      console.error(`[patch-graph] ${file}: target for "${p.name}" not found — the graph plugin changed; update this script`)
      failed = true
    }
  }
  fs.writeFileSync(file, src)
}
if (failed) process.exit(1)
