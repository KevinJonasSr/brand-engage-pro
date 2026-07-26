#!/usr/bin/env bash
# Insert <AltTextSuggester /> after <ImageUploader ... />.
# The original regex used [^/>] which fails on `=>` arrows in props.
# This version uses .*? with DOTALL.
set -euo pipefail
TARGET="$HOME/brand-engage-pro/frontend/app/brands/[slug]/community/new-post-form.tsx"
[ -f "$TARGET" ] || { echo "  ! $TARGET not found"; exit 1; }

python3 - "$TARGET" <<'PY'
import re
import sys
from pathlib import Path

target = Path(sys.argv[1])
src = target.read_text()

if "<AltTextSuggester" in src:
    print("  · AltTextSuggester JSX already present; skipping")
    raise SystemExit(0)

# Match <ImageUploader ... /> (self-closing, multi-line) using DOTALL
pattern = re.compile(r'(<ImageUploader\b.*?/>)', re.DOTALL)
m = pattern.search(src)
if not m:
    raise SystemExit("  ! couldn't find <ImageUploader ... /> tag")

suggester_jsx = (
    "\n          {imageUrl && (\n"
    "            <AltTextSuggester\n"
    "              imageUrl={imageUrl}\n"
    "              brandSlug={brandSlug}\n"
    "              partialBody={body}\n"
    "            />\n"
    "          )}"
)

src = src[:m.end()] + suggester_jsx + src[m.end():]
target.write_text(src)
print(f"  + inserted <AltTextSuggester /> after <ImageUploader />")
PY

cd "$HOME/brand-engage-pro/frontend"
echo
echo "── Type-check"
if grep -q '"typecheck"' package.json; then
  npm run typecheck
else
  npx tsc --noEmit
fi

cd "$HOME/brand-engage-pro"
echo
echo "── Commit + push"
git add frontend/app/brands/\[slug\]/community/new-post-form.tsx
if ! git diff --cached --quiet; then
  git commit -m "fix(ai): alt-text BEP — wire <AltTextSuggester /> render"
  echo "✓ Committed. Push: git push"
fi
