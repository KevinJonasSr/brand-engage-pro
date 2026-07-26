#!/usr/bin/env bash
# BEP moderation explainer:
#   1. Install lib/cron/component
#   2. vercel.json cron entry
#   3. Patch types.ts (add moderation_status + moderation_user_message
#      to all CommunityPost-shaped types — uses all-occurrences pattern)
#   4. Patch select strings
#   5. Patch post-card render (BEP composer path)
#   6. Type-check
#   7. Stage all + commit

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$HOME/brand-engage-pro"
cd "$REPO"

echo "── 1. Install files"
mkdir -p frontend/lib/moderation
cp "$DIR/lib_explain.ts" frontend/lib/moderation/explain-user.ts

mkdir -p frontend/app/api/cron/moderation-explain
cp "$DIR/cron_route.ts" frontend/app/api/cron/moderation-explain/route.ts

mkdir -p frontend/components/community
cp "$DIR/mod_chip.tsx" frontend/components/community/moderation-chip.tsx
echo "  · installed lib/moderation/explain-user.ts, /api/cron/moderation-explain/route.ts, components/community/moderation-chip.tsx"

echo
echo "── 2. Patch vercel.json"
python3 - <<'PY'
import json
from pathlib import Path

vj = Path.home() / "brand-engage-pro/frontend/vercel.json"
if not vj.exists():
    print("  ! vercel.json not found")
    raise SystemExit(1)
with vj.open() as f:
    data = json.load(f)
crons = data.setdefault("crons", [])
PATH, SCH = "/api/cron/moderation-explain", "*/15 * * * *"
existing = next((c for c in crons if isinstance(c, dict) and c.get("path") == PATH), None)
if existing:
    if existing.get("schedule") != SCH:
        existing["schedule"] = SCH
        print(f"  · updated schedule for {PATH}")
    else:
        print(f"  · {PATH} already present")
else:
    crons.append({"path": PATH, "schedule": SCH})
    print(f"  + added {PATH} @ '{SCH}'")
with vj.open("w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

echo
echo "── 3. Patch BEP types.ts (add moderation_status + moderation_user_message)"
python3 - <<'PY'
from pathlib import Path

target = Path.home() / "brand-engage-pro/frontend/lib/data/types.ts"
if not target.exists():
    print(f"  ! {target} not found")
    raise SystemExit(1)
src = target.read_text()
# BEP CommunityPost might already have moderation_status from Phase 2 port.
# Add moderation_user_message after EVERY moderation_status line that
# isn't already followed by it. If moderation_status is missing entirely,
# fall back to inserting after image_url (which BEP types should have).
lines = src.splitlines(keepends=True)
out = []
added = 0
status_seen = False
i = 0
while i < len(lines):
    out.append(lines[i])
    stripped = lines[i].strip()
    if stripped.startswith("moderation_status") and ":" in stripped:
        status_seen = True
        next_line = lines[i + 1] if i + 1 < len(lines) else ""
        if not next_line.strip().startswith("moderation_user_message"):
            indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
            out.append(f"{indent}moderation_user_message: string | null;\n")
            added += 1
    i += 1

if not status_seen:
    # No moderation_status anywhere — add both fields after image_url lines
    print("  · no moderation_status in BEP types; adding both fields after image_url")
    out2 = []
    i = 0
    while i < len(lines):
        out2.append(lines[i])
        stripped = lines[i].strip()
        if stripped.startswith("image_url") and ":" in stripped:
            indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
            # only add if next line isn't already moderation_status
            next_line = lines[i + 1] if i + 1 < len(lines) else ""
            if not next_line.strip().startswith("moderation_status"):
                out2.append(f"{indent}moderation_status: string | null;\n")
                out2.append(f"{indent}moderation_user_message: string | null;\n")
                added += 1
        i += 1
    out = out2

if added > 0:
    target.write_text("".join(out))
    print(f"  + added moderation_user_message (and possibly moderation_status) {added} time(s)")
else:
    print("  · all moderation_status declarations already paired with user_message")
PY

echo
echo "── 4. Patch select strings"
python3 - <<'PY'
import re
from pathlib import Path

ROOT = Path.home() / "brand-engage-pro/frontend"
patched = 0
for ext in ("*.ts", "*.tsx"):
    for f in list((ROOT / "lib" / "data").rglob(ext)) + list((ROOT / "app").rglob(ext)):
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        try:
            txt = f.read_text(errors="ignore")
        except OSError:
            continue
        if "community_posts" not in txt or "moderation_status" not in txt:
            continue

        def repl(m: re.Match) -> str:
            opener, body, closer = m.group(1), m.group(2), m.group(3)
            if "moderation_user_message" in body or "moderation_status" not in body:
                return m.group(0)
            return opener + re.sub(r"\bmoderation_status\b",
                                   "moderation_status, moderation_user_message",
                                   body, count=1) + closer
        new_txt = re.sub(r'(\.select\(\s*[\"\'`])([^\"\'`]*?)([\"\'`]\s*\))', repl, txt, flags=re.DOTALL)
        if new_txt != txt:
            f.write_text(new_txt)
            print(f"  + added moderation_user_message to select in {f.relative_to(ROOT.parent)}")
            patched += 1

if patched == 0:
    print("  · no matching selects (may already be wired or BEP doesn't surface moderation_status in selects yet)")
PY

echo
echo "── 5. Patch post-card render (BEP path)"
python3 - <<'PY'
from pathlib import Path
import re

target = Path.home() / "brand-engage-pro/frontend/app/brands/[slug]/community/post-card.tsx"
if not target.exists():
    print(f"  ! {target} not found")
    raise SystemExit(0)
src = target.read_text()
if "ModerationChip" in src:
    print("  · post-card already references ModerationChip; skipping")
    raise SystemExit(0)

# Add import: place after the LAST import line (handle multi-line imports)
lines = src.splitlines(keepends=True)
last_import = -1
for i, ln in enumerate(lines):
    if ln.startswith("import "):
        last_import = i
if last_import == -1:
    print("  ! no imports found in post-card.tsx")
    raise SystemExit(0)
# Walk forward for multi-line import close
closing = last_import
if "{" in lines[last_import] and "}" not in lines[last_import]:
    for k in range(last_import + 1, len(lines)):
        if "}" in lines[k]:
            closing = k
            break
lines.insert(closing + 1, 'import ModerationChip from "@/components/community/moderation-chip";\n')
src = "".join(lines)

# Insert chip JSX after the first opening of a post container element
chip = (
    '\n      {post.moderation_status === "auto_hide" && (\n'
    '        <ModerationChip message={post.moderation_user_message ?? null} />\n'
    '      )}\n'
)
container_re = re.compile(
    r'(\<(?:article|li|div)[^>]*className=\{?[^>]*\}?\>\s*\n)',
    re.MULTILINE,
)
m = container_re.search(src)
if not m:
    target.write_text(src)
    print(f"  · import added to {target.name} but couldn't locate post container; manual render needed:\n{chip}")
    raise SystemExit(0)
src = src[:m.end()] + chip + src[m.end():]
target.write_text(src)
print(f"  + wired ModerationChip into {target.name}")
PY

echo
echo "── 6. Type-check"
cd frontend
if grep -q '"typecheck"' package.json; then
  npm run typecheck
else
  npx tsc --noEmit
fi

cd "$REPO"
echo
echo "── 7. Stage + commit"
git add frontend/lib/moderation/explain-user.ts \
        frontend/components/community/moderation-chip.tsx \
        frontend/app/api/cron/moderation-explain/ \
        frontend/vercel.json \
        frontend/lib/data/types.ts \
        frontend/lib/data/community.ts \
        frontend/app/brands/\[slug\]/community/post-card.tsx
git add -A frontend/app frontend/lib 2>/dev/null || true
git status --short

if ! git diff --cached --quiet; then
  git commit -m "feat(ai): moderation explainer (BEP) — fan-facing reason chip"
  echo "✓ Committed. Push: git push"
else
  echo "  · nothing to commit"
fi
