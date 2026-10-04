// Colour graph nodes by note type, like Obsidian's graph colour groups.
// @quartz-community/graph only colours current / visited / other, so this
// patches its inline script after every `npm install` (wired as postinstall).
// Fails loudly if the plugin changes and the target code is no longer there.
import fs from "node:fs"

const files = [
  "node_modules/@quartz-community/graph/dist/index.js",
  "node_modules/@quartz-community/graph/dist/components/index.js",
]
const MARK = "/*type-colours*/"
const target =
  'function $e(i){var l=i.id===g;return l?Ie:K.has(i.id)||i.id.startsWith("tags/")?Qu:ue}'

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

const replacement =
  `${MARK}function $e(i){if(i.id===g)return Ie;var m=${JSON.stringify(colours)};` +
  `var f=i.id.split("/")[0];return m[f]||ue}`

let failed = false
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`[patch-graph] ${file} not installed, skipping`)
    continue
  }
  const src = fs.readFileSync(file, "utf8")
  if (src.includes(MARK)) {
    console.log(`[patch-graph] ${file} already patched`)
  } else if (src.includes(target)) {
    fs.writeFileSync(file, src.replace(target, replacement))
    console.log(`[patch-graph] ${file} node colours by type applied`)
  } else {
    console.error(`[patch-graph] target code not found in ${file} — the graph plugin changed; update this script`)
    failed = true
  }
}
if (failed) process.exit(1)
