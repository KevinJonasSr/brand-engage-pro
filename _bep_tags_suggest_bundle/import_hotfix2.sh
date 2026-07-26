#!/usr/bin/env bash
# Surgical fix v2: BEP composer doesn't have a CaptionSuggester import to
# anchor against. The misplaced TagSuggester import is wedged inside the
# multi-line `import { … } from "./actions";` block. We just move it
# above that block.

set -euo pipefail
TARGET="$HOME/brand-engage-pro/frontend/app/brands/[slug]/community/new-post-form.tsx"
[ -f "$TARGET" ] || { echo "  ! $TARGET not found"; exit 1; }

python3 - "$TARGET" <<'PY'
import sys
from pathlib import Path

target = Path(sys.argv[1])
src = target.read_text()

OLD = (
    'import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";\n'
    'import {\n'
    'import TagSuggester from "@/components/community/tag-suggester";\n'
    '  createAnnouncementAction,\n'
)
NEW = (
    'import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";\n'
    'import TagSuggester from "@/components/community/tag-suggester";\n'
    'import {\n'
    '  createAnnouncementAction,\n'
)

if NEW in src:
    print("  · already repaired; nothing to do")
elif OLD in src:
    src = src.replace(OLD, NEW, 1)
    target.write_text(src)
    print(f"  + repaired imports in {target.name}")
else:
    raise SystemExit(
        "  ! exact corrupted block not found. Inspect the file manually:\n"
        f"    {target}"
    )
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
