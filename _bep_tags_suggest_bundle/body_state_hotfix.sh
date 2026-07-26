#!/usr/bin/env bash
# Make BEP composer's body textarea controlled so TagSuggester can read it.
# Adds:
#   1. const [body, setBody] = useState<string>("");  after uploaderKey state
#   2. setBody("");                                  inside resetForm
#   3. value={body} onChange={...}                   on the body textarea
#
# Idempotent.

set -euo pipefail
TARGET="$HOME/brand-engage-pro/frontend/app/brands/[slug]/community/new-post-form.tsx"
[ -f "$TARGET" ] || { echo "  ! $TARGET not found"; exit 1; }

python3 - "$TARGET" <<'PY'
import re
import sys
from pathlib import Path

target = Path(sys.argv[1])
src = target.read_text()

# ---- 1. body state declaration ----
if "const [body, setBody]" in src:
    print("  · body state already declared")
else:
    OLD = "  const [uploaderKey, setUploaderKey] = useState(0);\n"
    NEW = (
        "  const [uploaderKey, setUploaderKey] = useState(0);\n"
        '  const [body, setBody] = useState<string>("");\n'
    )
    if OLD not in src:
        raise SystemExit(
            "  ! couldn't find uploaderKey state declaration to anchor body state"
        )
    src = src.replace(OLD, NEW, 1)
    print("  + added body state")

# ---- 2. setBody("") in resetForm ----
if 'setBody("")' in src:
    print("  · resetForm already clears body")
else:
    OLD = "    setUploaderKey((k) => k + 1);\n"
    NEW = (
        "    setUploaderKey((k) => k + 1);\n"
        '    setBody("");\n'
    )
    if OLD not in src:
        raise SystemExit(
            "  ! couldn't find setUploaderKey call inside resetForm"
        )
    src = src.replace(OLD, NEW, 1)
    print("  + wired resetForm to clear body")

# ---- 3. controlled textarea ----
if "value={body}" in src and "onChange={(e) => setBody(e.target.value)}" in src:
    print("  · textarea already controlled")
else:
    # Match: <textarea\n        name="body"\n  → insert value+onChange right after name
    pattern = re.compile(
        r'(<textarea\s*\n\s+name="body"\s*\n)',
    )
    m = pattern.search(src)
    if not m:
        raise SystemExit(
            "  ! couldn't find <textarea name=\"body\" line to add controlled props"
        )
    inject = (
        '        value={body}\n'
        '        onChange={(e) => setBody(e.target.value)}\n'
    )
    src = src[:m.end()] + inject + src[m.end():]
    print("  + made textarea controlled (value + onChange)")

target.write_text(src)
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
