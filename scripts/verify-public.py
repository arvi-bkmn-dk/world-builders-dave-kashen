#!/usr/bin/env python3
"""Gate that must pass before the public site is published.

Nothing may reach this site except material Dave has actually published:
the HoE podcast, the IGE newsletters, his Medium posts, guest appearances,
the public workshop (WS 01) and the Top 5 Frameworks doc.

Everything else in the private graph is OFF LIMITS -- the book manuscript
(BK), the Skool course (SK), the Brand Kit (BK-BBG), community calls (CC),
Monday Content Calls (MCC) and the Cohort 3 sessions (C3).

Usage:  python3 scripts/verify-public.py
Exit 0 = safe to publish.  Exit 1 = do not publish.
"""
import os, re, sys, unicodedata, collections

HERE    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(HERE, "content")
PRIVATE_SOURCES = os.path.expanduser(
    "~/Library/Mobile Documents/com~apple~CloudDocs/BN x AM/BN x AM/"
    "IGE Knowledge Graph/Sources")

PUBLIC_PREFIX = re.compile(r'^(HoE \d+|NL \d+|MB \d+|GA \d+|WS 01)\b|^Dave Kashen', re.I)
# internal source titles, numbered and non-numeric (SK CC, BK Intro) alike
INTERNAL_TITLE = re.compile(
    r'\b(?:SK|CC|MCC|C3|BK|BK-BBG)[ -](?:\d+|CC|Intro)\b'
    r'|Workshops and Cohort 3 Sessions', re.I)
COURSE_LANGUAGE = re.compile(
    r'\bskool\b|the lesson page|in the course|the course teaches|module \d', re.I)

def norm(s):
    s = unicodedata.normalize('NFKD', s)
    for a, b in [('’',"'"),('‘',"'"),('“','"'),('”','"'),
                 ('—',' '),('–',' ')]:
        s = s.replace(a, b)
    s = re.sub(r'\*\*|\*|__|_', '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s.lower())
    return re.sub(r'\s+', ' ', s).strip()

def quotes_in(text):
    """Blockquote lines that are actually quotes.

    A callout (`> [!info] ...`) and every continuation line beneath it is
    editorial chrome, not something Dave said. Only the first line carries
    the `[!` marker, so matching blockquote lines one by one reports every
    continuation line as an unattributed quote.
    """
    out, in_callout = [], False
    for line in text.split('\n'):
        if not line.startswith('>'):
            in_callout = False
            continue
        body = line[1:].strip()
        if body.startswith('[!'):
            in_callout = True
            continue
        if in_callout or not body or body.startswith(('[[', '→')):
            continue
        out.append(body)
    return out


def notes():
    for root, _, fs in os.walk(CONTENT):
        if '.obsidian' in root: continue
        for f in sorted(fs):
            if f.endswith('.md'):
                p = os.path.join(root, f)
                yield os.path.relpath(p, CONTENT), p

fails, warns = [], []

# ---------------------------------------------------------------- 1. titles
hits = []
for rel, p in notes():
    for i, line in enumerate(open(p, encoding='utf-8'), 1):
        if INTERNAL_TITLE.search(line):
            hits.append(f"{rel}:{i}: {line.strip()[:90]}")
print(f"[1] internal source titles ............ {len(hits)}")
if hits: fails.append(("Internal source titles", hits))

# ------------------------------------------------------- 2. course language
hits = []
for rel, p in notes():
    for i, line in enumerate(open(p, encoding='utf-8'), 1):
        if COURSE_LANGUAGE.search(line):
            hits.append(f"{rel}:{i}: {line.strip()[:90]}")
print(f"[2] Skool / course language ........... {len(hits)}")
if hits: fails.append(("Skool or course language", hits))

# ------------------------------------------------- 3. build notes / comments
hits = []
for rel, p in notes():
    t = open(p, encoding='utf-8').read()
    if '%%' in t: hits.append(f"{rel}: %% comment block")
    for m in re.finditer(r'(?m)^%[^%\n].*%\s*$', t):
        hits.append(f"{rel}: single-% build note (renders!): {m.group(0)[:70]}")
print(f"[3] build notes / comment blocks ...... {len(hits)}")
if hits: fails.append(("Build notes or comment blocks", hits))

# ------------------------------------------------------ 4. frontmatter sources
hits, empty = [], []
for rel, p in notes():
    m = re.search(r'^sources:\s*\[(.*?)\]\s*$', open(p, encoding='utf-8').read(), re.M | re.S)
    if not m: continue
    items = re.findall(r'"([^"]*)"', m.group(1))
    bad = [i for i in items if INTERNAL_TITLE.search(i)]
    if bad: hits.append(f"{rel}: {bad}")
    if not items: empty.append(rel)
print(f"[4] internal entries in sources: ...... {len(hits)}")
print(f"[5] notes with an empty sources: list . {len(empty)}")
if hits:  fails.append(("Internal entries in frontmatter sources:", hits))
if empty: warns.append(("Notes with no source at all", empty))

# ------------------------------------------------------------ 6. dataview
hits = [rel for rel, p in notes() if '```dataview' in open(p, encoding='utf-8').read()]
print(f"[6] dataview blocks (won't render) .... {len(hits)}")
if hits: fails.append(("Dataview blocks -- these render blank on the site", hits))

# -------------------------------------------------------- 7. broken wikilinks
titles = {os.path.basename(p)[:-3] for _, p in notes()}
LINK = re.compile(r'\[\[([^\[\]|#]+?)(?:#[^\[\]|]*)?(?:\|[^\[\]]+)?\]\]')
broken = collections.Counter()
for rel, p in notes():
    for t in LINK.findall(open(p, encoding='utf-8').read()):
        if t.strip() not in titles: broken[t.strip()] += 1
print(f"[7] broken wikilinks .................. {sum(broken.values())}")
if broken:
    fails.append(("Broken wikilinks", [f"{c}x  {t}" for t, c in broken.most_common()]))

# ------------------------------------------- 8. quotes: public-verified only
if not os.path.isdir(PRIVATE_SOURCES):
    print("[8] quote provenance .................. SKIPPED (private graph not found)")
    warns.append(("Quote provenance not checked",
                  [f"private sources not at {PRIVATE_SOURCES}"]))
else:
    pub, internal = [], []
    for root, _, fs in os.walk(PRIVATE_SOURCES):
        for f in fs:
            if not f.endswith('.md'): continue
            n = norm(open(os.path.join(root, f), encoding='utf-8').read())
            (pub if PUBLIC_PREFIX.match(f[:-3]) else internal).append((f[:-3], n, set(n.split())))
    leaks, checked, exact = [], 0, 0
    for rel, p in notes():
        for qs in quotes_in(open(p, encoding='utf-8').read()):
            nq = norm(qs)
            if len(nq) < 25: continue
            checked += 1
            if any(nq in h for _, h, _ in pub):      # verbatim in a public source
                exact += 1; continue
            tk = set(nq.split())                     # else: which side does it lean?
            bp = max((len(tk & s) / len(tk), n) for n, _, s in pub)
            bi = max((len(tk & s) / len(tk), n) for n, _, s in internal)
            if bi[0] > bp[0] + 0.05:
                leaks.append(f"{rel}: leans {bi[1]} ({bi[0]:.2f} vs public {bp[0]:.2f}) | {qs[:70]}")
    print(f"[8] quotes checked {checked}, verbatim-public {exact}, internal-leaning {len(leaks)}")
    if leaks:
        fails.append(("Quotes that trace to internal material", leaks))

# ------------------------------------------------------------------ verdict
print()
for label, items in warns:
    print(f"WARNING -- {label}: {len(items)}")
    for i in items[:5]: print(f"    {i}")
if fails:
    print("\nDO NOT PUBLISH\n")
    for label, items in fails:
        print(f"  {label}: {len(items)}")
        for i in items[:10]: print(f"      {i}")
        if len(items) > 10: print(f"      ... and {len(items)-10} more")
    sys.exit(1)
print(f"PASS -- {len(list(notes()))} notes, safe to publish.")
sys.exit(0)
