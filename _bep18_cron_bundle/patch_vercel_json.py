#!/usr/bin/env python3
"""
Add the /api/cron/post-drafts entry to brand-engage-pro/frontend/vercel.json crons.

Idempotent: if an entry with the same path already exists, leave it alone.
Schedule: 0 13 * * *  (13:00 UTC = 8am Central).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path.home() / "brand-engage-pro"
VERCEL_JSON = REPO / "frontend" / "vercel.json"
CRON_PATH = "/api/cron/post-drafts"
CRON_SCHEDULE = "0 13 * * *"


def main() -> int:
    if not VERCEL_JSON.exists():
        print(f"  ! {VERCEL_JSON} does not exist; skipping (cron entry must be added manually)")
        return 1

    with VERCEL_JSON.open() as f:
        data = json.load(f)

    crons = data.setdefault("crons", [])
    if not isinstance(crons, list):
        print(f"  ! crons key in {VERCEL_JSON} is not a list; aborting")
        return 1

    existing = next((c for c in crons if isinstance(c, dict) and c.get("path") == CRON_PATH), None)
    if existing is not None:
        if existing.get("schedule") != CRON_SCHEDULE:
            existing["schedule"] = CRON_SCHEDULE
            print(f"  · updated schedule for {CRON_PATH} to '{CRON_SCHEDULE}'")
        else:
            print(f"  · {CRON_PATH} already present with correct schedule; nothing to do")
    else:
        crons.append({"path": CRON_PATH, "schedule": CRON_SCHEDULE})
        print(f"  + added {CRON_PATH} @ '{CRON_SCHEDULE}'")

    with VERCEL_JSON.open("w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
