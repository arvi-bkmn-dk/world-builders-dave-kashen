// Build the knowledge base zip and attach it to the `knowledge-base` GitHub
// release, replacing the previous upload. Run after every publish:
//
//   node scripts/publish-download.mjs
//
// Sticky download link (always the latest upload):
// https://github.com/arvi-bkmn-dk/world-builders-dave-kashen/releases/download/knowledge-base/dave-kashen-knowledge-base.zip
//
// Auth comes from git's own credential helper, the same login `git push` uses.
// (A GitHub Action would do this on every push, but the local token lacks the
// `workflow` scope needed to push one: .github/workflows/knowledge-base-download.yml
// is ready to commit once that scope exists.)
import { execFileSync } from "node:child_process"
import fs from "node:fs"

const REPO = "arvi-bkmn-dk/world-builders-dave-kashen"
const TAG = "knowledge-base"
const FILE = "dist/dave-kashen-knowledge-base.zip"
const NAME = "dave-kashen-knowledge-base.zip"

execFileSync("node", ["scripts/build-download.mjs", FILE], { stdio: "inherit" })

const cred = execFileSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
})
const token = /^password=(.*)$/m.exec(cred)?.[1]
if (!token) throw new Error("no GitHub credential from git credential fill")

const api = (path, opts = {}) =>
  fetch(path.startsWith("http") ? path : `https://api.github.com/repos/${REPO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    },
  })

const sha = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim()
const notes =
  "The published Dave Kashen Knowledge Base as Markdown notes, ready to open in Obsidian. " +
  `Updated ${new Date().toISOString().slice(0, 10)} (${sha.slice(0, 7)}).`

let res = await api(`/releases/tags/${TAG}`)
let release
if (res.status === 404) {
  res = await api(`/releases`, {
    method: "POST",
    body: JSON.stringify({
      tag_name: TAG,
      target_commitish: sha,
      name: "Dave Kashen Knowledge Base",
      body: notes,
      make_latest: "true",
    }),
  })
  if (!res.ok) throw new Error(`create release: ${res.status} ${await res.text()}`)
  release = await res.json()
  console.log("[publish-download] created release", release.html_url)
} else if (res.ok) {
  release = await res.json()
  await api(`/releases/${release.id}`, {
    method: "PATCH",
    body: JSON.stringify({ body: notes, make_latest: "true" }),
  })
} else {
  throw new Error(`get release: ${res.status} ${await res.text()}`)
}

for (const a of release.assets || []) {
  if (a.name === NAME) await api(`/releases/assets/${a.id}`, { method: "DELETE" })
}
const data = fs.readFileSync(FILE)
res = await api(
  `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${NAME}`,
  { method: "POST", headers: { "Content-Type": "application/zip" }, body: data },
)
if (!res.ok) throw new Error(`upload: ${res.status} ${await res.text()}`)
console.log(
  `[publish-download] uploaded ${NAME} (${(data.length / 1e6).toFixed(1)} MB) → ` +
    `https://github.com/${REPO}/releases/download/${TAG}/${NAME}`,
)
