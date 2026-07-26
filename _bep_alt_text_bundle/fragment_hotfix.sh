#!/usr/bin/env bash
# The {kind !== "poll" && (<ImageUploader ... />)} pattern in BEP composer
# wraps a SINGLE element. My render_hotfix.sh added a sibling, breaking
# the conditional. Fix: wrap ImageUploader + AltTextSuggester in <>...</>.
set -euo pipefail
TARGET="$HOME/brand-engage-pro/frontend/app/brands/[slug]/community/new-post-form.tsx"
[ -f "$TARGET" ] || { echo "  ! $TARGET not found"; exit 1; }

python3 - "$TARGET" <<'PY'
import sys
from pathlib import Path

target = Path(sys.argv[1])
src = target.read_text()

# The exact (broken) section to replace, captured from sed output.
OLD = """      {kind !== "poll" && (
        <ImageUploader
          key={uploaderKey}
          bucket="community-uploads"
          name="image_url"
          label={kind === "challenge" ? "Add cover photo" : "Add photo"}
            onUploaded={(url) => setImageUrl(url)}
          />
          {imageUrl && (
            <AltTextSuggester
              imageUrl={imageUrl}
              brandSlug={brandSlug}
              partialBody={body}
            />
          )}
      )}"""

NEW = """      {kind !== "poll" && (
        <>
          <ImageUploader
            key={uploaderKey}
            bucket="community-uploads"
            name="image_url"
            label={kind === "challenge" ? "Add cover photo" : "Add photo"}
            onUploaded={(url) => setImageUrl(url)}
          />
          {imageUrl && (
            <AltTextSuggester
              imageUrl={imageUrl}
              brandSlug={brandSlug}
              partialBody={body}
            />
          )}
        </>
      )}"""

if NEW in src:
    print("  · already wrapped in fragment; nothing to do")
elif OLD in src:
    src = src.replace(OLD, NEW, 1)
    target.write_text(src)
    print("  + wrapped ImageUploader + AltTextSuggester in <>...</> fragment")
else:
    raise SystemExit(
        "  ! couldn't find exact broken section; manual edit needed.\n"
        "  Wrap <ImageUploader /> and <AltTextSuggester /> in a <>...</> fragment "
        "inside the {kind !== \"poll\" && (...)} conditional."
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
git add frontend/app/brands/\[slug\]/community/new-post-form.tsx
if ! git diff --cached --quiet; then
  git commit -m "fix(ai): alt-text BEP — wrap ImageUploader + AltTextSuggester in fragment"
  echo "✓ Committed. Push: git push"
fi
