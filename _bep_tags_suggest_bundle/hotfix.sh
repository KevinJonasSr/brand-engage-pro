#!/usr/bin/env bash
# All-in-one for AI #5 (BEP) tag suggester:
#   1. Install lib/tagging/suggest.ts + api route + TagSuggester component
#   2. Patch createPostAction (capture ai_suggested_tags + merge into tags)
#   3. Patch new-post-form.tsx (import + render TagSuggester)
#   4. Type-check
#   5. git add ALL new + modified files (avoids the FE-bundle git-add bug)
#   6. Commit
#
# Idempotent. Safe to re-run.

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$HOME/brand-engage-pro"
cd "$REPO"

echo "── 1. Install files"
mkdir -p frontend/lib/tagging
cp "$DIR/lib_suggest.ts" frontend/lib/tagging/suggest.ts

mkdir -p frontend/app/api/ai/suggest-tags
cp "$DIR/api_route.ts" frontend/app/api/ai/suggest-tags/route.ts

mkdir -p frontend/components/community
cp "$DIR/tag_suggester.tsx" frontend/components/community/tag-suggester.tsx
echo "  · installed lib/tagging/suggest.ts, /api/ai/suggest-tags/route.ts, components/community/tag-suggester.tsx"

echo
echo "── 2. Patch createPostAction (capture + merge)"
python3 - <<'PY'
from pathlib import Path
import re

MARKER = "AI #5 — capture member-selected tags from TagSuggester"

frontend = Path.home() / "brand-engage-pro/frontend"
candidates = []
for f in frontend.rglob("actions.ts"):
    try:
        txt = f.read_text(errors="ignore")
    except OSError:
        continue
    if "createPostAction" in txt and "community_posts" in txt:
        candidates.append(f)

if not candidates:
    print("  ! couldn't find createPostAction — manual wire-up needed")
    raise SystemExit(0)

candidates.sort(key=lambda p: ("brands" not in str(p), "community" not in str(p), p))
target = candidates[0]
print(f"  · target: {target.relative_to(Path.home())}")

txt = target.read_text()
if MARKER in txt:
    print("  · already patched; skipping")
    raise SystemExit(0)

CAPTURE = """
  // {marker}
  const aiSuggestedTagsRaw = String(formData.get("ai_suggested_tags") ?? "");
  const aiSuggestedTags = aiSuggestedTagsRaw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 24);
""".format(marker=MARKER)

body_re = re.compile(r'(formData\.get\("body"\)[^\n]*\n)')
m = body_re.search(txt)
if not m:
    print("  ! couldn't find formData.get(\"body\") anchor")
    raise SystemExit(0)
new = txt[:m.end()] + CAPTURE + txt[m.end():]

# Inject merge into the .from("community_posts").insert({...}) payload
insert_re = re.compile(
    r'\.from\("community_posts"\)\s*\.insert\(\s*\{(.*?)\}\s*\)',
    re.DOTALL,
)
cm = insert_re.search(new)
if not cm:
    target.write_text(new)
    print("  · capture block inserted but no insert call found; manual merge needed")
    raise SystemExit(0)

payload = cm.group(1)
if "tags:" in payload or "tags :" in payload:
    tags_re = re.compile(r"(tags\s*:\s*)([^,}\n]+)")
    new_payload, count = tags_re.subn(
        lambda m: m.group(1)
        + f"[...new Set([...((({m.group(2).strip()}) ?? []) as string[]), ...aiSuggestedTags])].slice(0, 6)",
        payload,
        count=1,
    )
    if count == 0:
        target.write_text(new)
        print("  · capture block inserted; tags-key replacement didn't match — manual merge needed")
        raise SystemExit(0)
else:
    stripped = payload.rstrip()
    sep = " " if stripped.endswith(",") else ", "
    new_payload = stripped + sep + (
        "tags: aiSuggestedTags.length > 0 ? aiSuggestedTags.slice(0, 6) : null"
    )

new = new[:cm.start()] + ".from(\"community_posts\").insert({" + new_payload + "})" + new[cm.end():]
target.write_text(new)
print("  + patched (capture + tags merge)")
PY

echo
echo "── 3. Patch new-post-form.tsx (import + render <TagSuggester />)"
COMPOSER="$REPO/frontend/app/brands/[slug]/community/new-post-form.tsx"

if [ ! -f "$COMPOSER" ]; then
  echo "  ! $COMPOSER not found — searching for alternate path…"
  COMPOSER=$(grep -rln 'name="body"' "$REPO/frontend/app" 2>/dev/null \
    | grep -v comment-composer \
    | grep -v challenge \
    | head -1 || true)
  if [ -z "$COMPOSER" ]; then
    echo "  ! no composer file found; manual wire-up required"
  else
    echo "  · fallback target: $COMPOSER"
  fi
fi

if [ -n "$COMPOSER" ] && [ -f "$COMPOSER" ]; then
  if grep -q "TagSuggester" "$COMPOSER"; then
    echo "  · $COMPOSER already references TagSuggester; skipping"
  else
    python3 - "$COMPOSER" <<'PY'
import sys
from pathlib import Path

target = Path(sys.argv[1])
src = target.read_text()

# 1) import after the CaptionSuggester import (BEP forked from FE so it has it)
if 'import CaptionSuggester from "./caption-suggester";' in src:
    src = src.replace(
        'import CaptionSuggester from "./caption-suggester";',
        'import CaptionSuggester from "./caption-suggester";\n'
        'import TagSuggester from "@/components/community/tag-suggester";',
    )
elif 'import CaptionSuggester' in src:
    # alternate import path — still hook in nearby
    import re
    src = re.sub(
        r'(import\s+CaptionSuggester[^\n]+\n)',
        r'\1import TagSuggester from "@/components/community/tag-suggester";\n',
        src,
        count=1,
    )
else:
    # No CaptionSuggester — append after last import line
    lines = src.splitlines(keepends=True)
    last = -1
    for i, ln in enumerate(lines):
        if ln.startswith("import "):
            last = i
    if last == -1:
        print("  ! no import statements found; aborting composer patch")
        raise SystemExit(0)
    lines.insert(last + 1, 'import TagSuggester from "@/components/community/tag-suggester";\n')
    src = "".join(lines)

# 2) Render <TagSuggester /> after the caption_used hidden input
caption_anchor = '<input type="hidden" name="caption_used" value={captionUsed ? "1" : "0"} />'
new_block = (
    caption_anchor
    + "\n\n"
    "      {/* AI #5 — TagSuggester (lights M-2 filter chips on submit) */}\n"
    "      <TagSuggester partialBody={body} brandSlug={brandSlug} />"
)
if caption_anchor in src:
    src = src.replace(caption_anchor, new_block, 1)
else:
    # Fallback: insert after the body textarea closing tag
    import re
    pattern = re.compile(
        r'(<textarea[^>]*\bname="body"[^>]*(?:\/>|>[^<]*<\/textarea>))',
        re.DOTALL,
    )
    m = pattern.search(src)
    if not m:
        print("  ! couldn't find caption_used anchor or body textarea; aborting composer patch")
        raise SystemExit(0)
    suggester = (
        "\n\n      {/* AI #5 — TagSuggester (lights M-2 filter chips on submit) */}\n"
        "      <TagSuggester partialBody={body} brandSlug={brandSlug} />"
    )
    src = src[:m.end()] + suggester + src[m.end():]

target.write_text(src)
print(f"  + patched {target}")
PY
  fi
fi

echo
echo "── 4. Type-check"
cd "$REPO/frontend"
if grep -q '"typecheck"' package.json; then
  npm run typecheck
else
  npx tsc --noEmit
fi

cd "$REPO"
echo
echo "── 5. Stage all new + modified files"
# Explicit: new files (often missed by partial git add) + the modified ones
git add frontend/lib/tagging/suggest.ts \
        frontend/components/community/tag-suggester.tsx \
        frontend/app/api/ai/suggest-tags/
# Modified files
git add -A frontend/app/brands 2>/dev/null || true
git status --short

echo
echo "── 6. Commit"
if ! git diff --cached --quiet; then
  git commit -m "feat(ai): #5 fan-facing TagSuggester (BEP)"
  echo
  echo "✓ Bundle applied. Push: git push"
else
  echo "  · nothing to commit"
fi
