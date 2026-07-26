#!/usr/bin/env python3
"""
Wire <PickedForYou /> into BEP brand community page.
Mirrors the FE patch but reads from member.id and slug.
Idempotent.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

TARGET = (
    Path.home()
    / "brand-engage-pro"
    / "frontend"
    / "app"
    / "brands"
    / "[slug]"
    / "community"
    / "page.tsx"
)
IMPORT_LINE = 'import PickedForYou from "@/components/personal/picked-for-you";'


def main() -> int:
    if not TARGET.exists():
        print(f"  ! {TARGET} not found")
        return 1
    src = TARGET.read_text()

    if "PickedForYou" in src:
        print("  · PickedForYou already wired; nothing to do")
        return 0

    lines = src.splitlines(keepends=True)
    last_import = -1
    for i, ln in enumerate(lines):
        if ln.startswith("import "):
            last_import = i
    if last_import == -1:
        print("  ! no imports found in community page")
        return 1
    closing = last_import
    if "{" in lines[last_import] and "}" not in lines[last_import]:
        for k in range(last_import + 1, len(lines)):
            if "}" in lines[k]:
                closing = k
                break
    lines.insert(closing + 1, IMPORT_LINE + "\n")
    src = "".join(lines)

    # BEP variants: `member.id` + `slug` (or `params.slug`).
    has_params_slug = "params.slug" in src or re.search(r"const\s*\{\s*slug\s*\}\s*=", src)
    has_member_id = bool(re.search(r"\bmember\??\.\s*id\b", src) or "member.id" in src)

    if not (has_params_slug and has_member_id):
        TARGET.write_text(src)
        print("  · import added; couldn't auto-detect member/slug variables — manual render needed:")
        print(
            """      {member && (
        <PickedForYou memberId={member.id} brandSlug={slug} />
      )}"""
        )
        return 0

    main_re = re.compile(r"(<main\b[^>]*>\s*\n)", re.MULTILINE)
    m = main_re.search(src)
    if not m:
        main_re = re.compile(r'(<(?:section|div)\b[^>]*className=[^>]*>\s*\n)', re.MULTILINE)
        m = main_re.search(src)
    if not m:
        TARGET.write_text(src)
        print("  · import added but no container anchor found; manual render needed")
        return 0

    slug_var = "slug" if re.search(r"const\s*\{\s*slug\s*\}\s*=", src) else "params.slug"

    block = (
        '\n      {member?.id && (\n'
        f'        <PickedForYou memberId={{member.id}} brandSlug={{{slug_var}}} />\n'
        '      )}\n'
    )
    src = src[:m.end()] + block + src[m.end():]
    TARGET.write_text(src)
    print(f"  + wired <PickedForYou /> into {TARGET.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
