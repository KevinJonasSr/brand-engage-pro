#!/usr/bin/env bash
# BEP alt-text Phase 1+2 combined.

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$HOME/brand-engage-pro"
cd "$REPO"

echo "── 1. Install lib + api + cron + component"
mkdir -p frontend/lib/alt-text
cp "$DIR/lib_alt.ts" frontend/lib/alt-text/generate.ts

mkdir -p frontend/app/api/ai/alt-text
cp "$DIR/api_route.ts" frontend/app/api/ai/alt-text/route.ts

mkdir -p frontend/app/api/cron/alt-text-backfill
cp "$DIR/cron_backfill_route.ts" frontend/app/api/cron/alt-text-backfill/route.ts

mkdir -p frontend/components/community
cp "$DIR/alt_text_suggester.tsx" frontend/components/community/alt-text-suggester.tsx
echo "  · installed lib + api + cron + AltTextSuggester"

echo
echo "── 2. Patch vercel.json (backfill cron entry)"
python3 - <<'PY'
import json
from pathlib import Path
vj = Path.home() / "brand-engage-pro/frontend/vercel.json"
if not vj.exists():
    print("  ! vercel.json not found"); raise SystemExit(1)
with vj.open() as f:
    data = json.load(f)
crons = data.setdefault("crons", [])
PATH, SCH = "/api/cron/alt-text-backfill", "*/15 * * * *"
existing = next((c for c in crons if isinstance(c, dict) and c.get("path") == PATH), None)
if existing:
    if existing.get("schedule") != SCH:
        existing["schedule"] = SCH
        print(f"  · updated {PATH}")
    else:
        print(f"  · {PATH} already present")
else:
    crons.append({"path": PATH, "schedule": SCH})
    print(f"  + added {PATH}")
with vj.open("w") as f:
    json.dump(data, f, indent=2); f.write("\n")
PY

echo
echo "── 3. Patch BEP composer (add imageUrl state + onUploaded + render <AltTextSuggester />)"
python3 - <<'PY'
import re
from pathlib import Path

target = Path.home() / "brand-engage-pro/frontend/app/brands/[slug]/community/new-post-form.tsx"
if not target.exists():
    print(f"  ! {target} not found")
    raise SystemExit(1)
src = target.read_text()

if "AltTextSuggester" in src:
    print("  · composer already references AltTextSuggester; skipping")
    raise SystemExit(0)

# 1) Import — insert after the `import { useFormSave, ... }` line as a
#    standalone single-line import (avoids the multi-line-import-block
#    bug from the BEP TagSuggester patch).
useform_import = (
    'import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";'
)
if useform_import in src:
    src = src.replace(
        useform_import,
        useform_import
        + '\nimport AltTextSuggester from "@/components/community/alt-text-suggester";',
        1,
    )
else:
    # Fallback: after first single-line import we can find that ends with ;
    m = re.search(r'^(import\s+[A-Za-z_][^\n]*from\s+[\"\'][^\"\']+[\"\'];)\s*$', src, re.MULTILINE)
    if not m:
        raise SystemExit("  ! couldn't find a safe import anchor")
    src = src[:m.end()] + '\nimport AltTextSuggester from "@/components/community/alt-text-suggester";' + src[m.end():]

# 2) imageUrl state — add after uploaderKey state (mirror of body state add)
if "const [imageUrl, setImageUrl]" not in src:
    OLD_STATE = "  const [uploaderKey, setUploaderKey] = useState(0);\n"
    NEW_STATE = (
        "  const [uploaderKey, setUploaderKey] = useState(0);\n"
        "  const [imageUrl, setImageUrl] = useState<string | null>(null);\n"
    )
    if OLD_STATE in src:
        src = src.replace(OLD_STATE, NEW_STATE, 1)
    else:
        # Fallback anchor: any useState in the function body
        m = re.search(r"(  const \[\w+, set\w+\] = useState[^\n]*\n)", src)
        if not m:
            raise SystemExit("  ! couldn't find a useState anchor for imageUrl state")
        src = src[:m.end()] + "  const [imageUrl, setImageUrl] = useState<string | null>(null);\n" + src[m.end():]

# 3) resetForm — add setImageUrl(null) after uploaderKey reset
if "setImageUrl(null)" not in src:
    RESET_OLD = "    setUploaderKey((k) => k + 1);\n"
    RESET_NEW = (
        "    setUploaderKey((k) => k + 1);\n"
        "    setImageUrl(null);\n"
    )
    if RESET_OLD in src:
        src = src.replace(RESET_OLD, RESET_NEW, 1)
    else:
        print("  · couldn't find resetForm uploaderKey anchor; image state will leak across submits — manual fix needed")

# 4) Wire ImageUploader onUploaded — find <ImageUploader> and add onUploaded prop if absent
imageuploader_re = re.compile(
    r'<ImageUploader\b([^/>]*?)(/>|>)',
    re.DOTALL,
)
def add_onuploaded(m: re.Match) -> str:
    attrs = m.group(1)
    closer = m.group(2)
    if "onUploaded" in attrs:
        return m.group(0)
    new_attrs = attrs.rstrip()
    if not new_attrs.endswith("\n"):
        new_attrs += "\n            "
    return (
        "<ImageUploader" + new_attrs +
        'onUploaded={(url) => setImageUrl(url)}\n          ' + closer
    )
src, n_subs = imageuploader_re.subn(add_onuploaded, src, count=1)
if n_subs == 0:
    print("  ! no <ImageUploader> tag found; AltTextSuggester won't fire on upload — manual fix needed")

# 5) Render <AltTextSuggester /> — best-effort: insert right after the closing
#    of the <ImageUploader> tag we just patched (or any <ImageUploader>...).
suggester_jsx = (
    '\n          {imageUrl && (\n'
    '            <AltTextSuggester\n'
    '              imageUrl={imageUrl}\n'
    '              brandSlug={brandSlug}\n'
    '              partialBody={body}\n'
    '            />\n'
    '          )}\n'
)
# Try: close of ImageUploader self-closing: />
m = re.search(r'<ImageUploader\b[^/>]*?/>', src, re.DOTALL)
if m:
    src = src[:m.end()] + suggester_jsx + src[m.end():]
else:
    # Try paired form: <ImageUploader>...</ImageUploader>
    m = re.search(r'<ImageUploader\b[^>]*>.*?</ImageUploader>', src, re.DOTALL)
    if m:
        src = src[:m.end()] + suggester_jsx + src[m.end():]
    else:
        print("  · couldn't insert <AltTextSuggester /> — manual addition needed:")
        print(suggester_jsx)

target.write_text(src)
print(f"  + wired AltTextSuggester into {target.name}")
PY

echo
echo "── 4. Patch createPostAction (capture image_alt from formData)"
python3 - <<'PY'
import re
from pathlib import Path

target = Path.home() / "brand-engage-pro/frontend/app/brands/[slug]/community/actions.ts"
if not target.exists():
    print(f"  ! {target} not found"); raise SystemExit(1)
src = target.read_text()
MARKER = "AI alt-text — capture member-edited image_alt"
if MARKER in src:
    print("  · actions.ts already patched; skipping"); raise SystemExit(0)

CAPTURE = f"""
  // {MARKER}
  const imageAltRaw = String(formData.get("image_alt") ?? "").trim();
  const imageAlt = imageAltRaw.length > 0 ? imageAltRaw.slice(0, 500) : null;
"""

m = re.search(r'(formData\.get\("body"\)[^\n]*\n)', src)
if not m:
    print("  ! no formData.get(\"body\") anchor"); raise SystemExit(1)
src = src[:m.end()] + CAPTURE + src[m.end():]

insert_re = re.compile(
    r'\.from\("community_posts"\)\s*\.insert\(\s*\{(.*?)\}\s*\)',
    re.DOTALL,
)
cm = insert_re.search(src)
if not cm:
    target.write_text(src)
    print("  · capture block added but no insert call found"); raise SystemExit(0)

payload = cm.group(1)
if "image_alt:" not in payload:
    stripped = payload.rstrip()
    sep = " " if stripped.endswith(",") else ", "
    new_payload = stripped + sep + "image_alt: imageAlt"
    src = src[:cm.start()] + ".from(\"community_posts\").insert({" + new_payload + "})" + src[cm.end():]

target.write_text(src)
print(f"  + patched {target.name}")
PY

echo
echo "── 5. Patch types.ts (add image_alt after EVERY image_url)"
python3 - <<'PY'
from pathlib import Path
target = Path.home() / "brand-engage-pro/frontend/lib/data/types.ts"
if not target.exists():
    print("  ! types.ts not found"); raise SystemExit(1)
lines = target.read_text().splitlines(keepends=True)
out, added = [], 0
i = 0
while i < len(lines):
    out.append(lines[i])
    s = lines[i].strip()
    if s.startswith("image_url") and ":" in s:
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if not nxt.strip().startswith("image_alt"):
            indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
            out.append(f"{indent}image_alt: string | null;\n")
            added += 1
    i += 1
target.write_text("".join(out))
print(f"  + added image_alt {added} time(s)")
PY

echo
echo "── 6. Patch select strings"
python3 - <<'PY'
import re
from pathlib import Path
ROOT = Path.home() / "brand-engage-pro/frontend"
patched = 0
for ext in ("*.ts", "*.tsx"):
    for f in list((ROOT / "lib" / "data").rglob(ext)) + list((ROOT / "app").rglob(ext)):
        if "node_modules" in f.parts or ".next" in f.parts: continue
        try: txt = f.read_text(errors="ignore")
        except OSError: continue
        if "community_posts" not in txt or "image_url" not in txt: continue
        def repl(m: re.Match) -> str:
            opener, body, closer = m.group(1), m.group(2), m.group(3)
            if "image_alt" in body or "image_url" not in body: return m.group(0)
            return opener + re.sub(r"\bimage_url\b", "image_url, image_alt", body, count=1) + closer
        new_txt = re.sub(r'(\.select\(\s*[\"\'`])([^\"\'`]*?)([\"\'`]\s*\))', repl, txt, flags=re.DOTALL)
        if new_txt != txt:
            f.write_text(new_txt)
            print(f"  + select patched: {f.relative_to(ROOT.parent)}")
            patched += 1
if patched == 0:
    print("  · no eligible selects found")
PY

echo
echo "── 7. Patch post-card render (alt={post.image_alt ?? \"\"})"
python3 - <<'PY'
import re
from pathlib import Path
ROOT = Path.home() / "brand-engage-pro/frontend"
patched = 0
for f in ROOT.rglob("*.tsx"):
    if "node_modules" in f.parts or ".next" in f.parts: continue
    try: txt = f.read_text(errors="ignore")
    except OSError: continue
    if "post.image_url" not in txt or "post.image_alt" in txt: continue
    original = txt
    altstr = re.compile(r'alt="([^"]*)"')
    indices = []
    for m in altstr.finditer(txt):
        win = txt[max(0, m.start()-400):m.end()+50]
        if "post.image_url" in win and "post.image_alt" not in win:
            indices.append(m)
    for m in reversed(indices):
        v = m.group(1)
        txt = txt[:m.start()] + f'alt={{post.image_alt ?? "{v}"}}' + txt[m.end():]
    altexpr = re.compile(r'alt=\{([^{}]+)\}')
    indices = []
    for m in altexpr.finditer(txt):
        win = txt[max(0, m.start()-400):m.end()+50]
        if "post.image_url" in win and "post.image_alt" not in win:
            indices.append(m)
    for m in reversed(indices):
        inner = m.group(1).strip()
        if "post.image_alt" in inner: continue
        txt = txt[:m.start()] + f'alt={{post.image_alt ?? ({inner})}}' + txt[m.end():]
    if txt != original:
        f.write_text(txt)
        print(f"  + alt wired: {f.relative_to(ROOT.parent)}")
        patched += 1
if patched == 0:
    print("  · no <img>/<Image> with post.image_url + alt= found")
PY

echo
echo "── 8. Type-check"
cd frontend
if grep -q '"typecheck"' package.json; then
  npm run typecheck
else
  npx tsc --noEmit
fi

cd "$REPO"
echo
echo "── 9. Stage + commit"
git add frontend/lib/alt-text/generate.ts \
        frontend/components/community/alt-text-suggester.tsx \
        frontend/app/api/ai/alt-text/ \
        frontend/app/api/cron/alt-text-backfill/ \
        frontend/vercel.json \
        frontend/lib/data/types.ts \
        frontend/lib/data/community.ts \
        frontend/app/brands/\[slug\]/community/new-post-form.tsx \
        frontend/app/brands/\[slug\]/community/actions.ts \
        frontend/app/brands/\[slug\]/community/post-card.tsx
git add -A frontend/app frontend/lib frontend/components 2>/dev/null || true
git status --short

if ! git diff --cached --quiet; then
  git commit -m "feat(ai): alt-text Phase 1+2 (BEP) — suggester + backfill cron + render"
  echo "✓ Committed. Push: git push"
else
  echo "  · nothing to commit"
fi
