#!/usr/bin/env bash
# Surgical fix for the broken import in BEP new-post-form.tsx.
# Removes the misplaced TagSuggester import line and re-inserts it
# directly after the CaptionSuggester import (any path).

set -euo pipefail
TARGET="$HOME/brand-engage-pro/frontend/app/brands/[slug]/community/new-post-form.tsx"
[ -f "$TARGET" ] || { echo "  ! $TARGET not found"; exit 1; }

python3 - "$TARGET" <<'PY'
import re
import sys
from pathlib import Path

target = Path(sys.argv[1])
src = target.read_text()

# 1) Remove ALL existing TagSuggester imports (defensive — undo prior bad inserts)
src = re.sub(
    r"^\s*import\s+TagSuggester\s+from\s+[\"'][^\"']+[\"'];?\s*\n",
    "",
    src,
    flags=re.MULTILINE,
)

# 2) Find the line that imports CaptionSuggester (any path) and append
#    the TagSuggester import directly after it as a STANDALONE line.
m = re.search(
    r"^(import\s+CaptionSuggester\s+from\s+[\"'][^\"']+[\"'];?)\s*$",
    src,
    flags=re.MULTILINE,
)
if not m:
    raise SystemExit(
        "  ! couldn't find CaptionSuggester import line; "
        "manual edit needed: add\n"
        "    import TagSuggester from \"@/components/community/tag-suggester\";\n"
        "  somewhere in the imports."
    )

start, end = m.span()
new_line = '\nimport TagSuggester from "@/components/community/tag-suggester";'
src = src[:end] + new_line + src[end:]

target.write_text(src)
print(f"  + repaired imports in {target.name}")
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
echo "── Stage + commit"
git add frontend/lib/tagging/suggest.ts \
        frontend/components/community/tag-suggester.tsx \
        frontend/app/api/ai/suggest-tags/ \
        frontend/app/brands/\[slug\]/community/new-post-form.tsx \
        frontend/app/brands/\[slug\]/community/actions.ts || true
git status --short
if ! git diff --cached --quiet; then
  git commit -m "feat(ai): #5 fan-facing TagSuggester (BEP)"
  echo "✓ Committed. Push: git push"
else
  echo "  · nothing to commit"
fi
