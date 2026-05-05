/**
 * Single source of truth for date/time formatting across the app (M-1).
 *
 * Before this module landed, six different functions across six files
 * formatted dates differently — different cutoffs (7d vs 30d), different
 * fallback formats (`M/D/YYYY` from `toLocaleDateString()` default, vs
 * `Mar 14` from explicit options). Inbox showed "10h ago" / "5d ago" /
 * "Apr 27" / "4/24/2026" mixed in the same list. This module fixes that.
 *
 * Output spec:
 *   < 1 minute (past):    "just now"
 *   < 1 hour past/future: "5m ago" / "in 5m"
 *   < 1 day:              "3h ago" / "in 3h"
 *   < 30 days:            "12d ago" / "in 12d"
 *   ≥ 30 days:            "Mar 14" (current year) / "Mar 14, 2024" (other)
 *
 * `absoluteDate()` exposes the ≥30-day branch for places that always want
 * the absolute form (anniversary dates, search-result timestamps, etc.).
 *
 * `dateRange()` formats a start/end pair with same-month optimization
 * (e.g. "Apr 28 – May 5" or "Mar 30 – Apr 5"); used by the weekly recap.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RELATIVE_CUTOFF_DAYS = 30;

type ISOLike = string | Date | null | undefined;

function toDate(iso: ISOLike): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Primary helper. See file header for output spec. */
export function relativeTime(iso: ISOLike): string {
  const d = toDate(iso);
  if (!d) return "";
  const now = Date.now();
  const diff = d.getTime() - now;
  const ad = Math.abs(diff);

  if (ad < MIN) return "just now";
  if (ad < HOUR) {
    const m = Math.max(1, Math.round(ad / MIN));
    return diff > 0 ? `in ${m}m` : `${m}m ago`;
  }
  if (ad < DAY) {
    const h = Math.round(ad / HOUR);
    return diff > 0 ? `in ${h}h` : `${h}h ago`;
  }
  if (ad < RELATIVE_CUTOFF_DAYS * DAY) {
    const days = Math.round(ad / DAY);
    return diff > 0 ? `in ${days}d` : `${days}d ago`;
  }
  return absoluteDate(d);
}

/**
 * "Mar 14" if same year as today; "Mar 14, 2024" otherwise.
 * Use this when you always want the absolute form (e.g. anniversary
 * tile, search-result timestamps).
 */
export function absoluteDate(iso: ISOLike): string {
  const d = toDate(iso);
  if (!d) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * "Apr 28 – May 5" (cross-month) or "Apr 28 – May 5"... wait, same-month
 * collapses the second month: "Apr 28 – 30". Used by the weekly recap.
 */
export function dateRange(startIso: ISOLike, endIso: ISOLike): string {
  const start = toDate(startIso);
  const end = toDate(endIso);
  if (!start || !end) return "";
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();
  const fmtFull = (x: Date) =>
    x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtDay = (x: Date) =>
    x.toLocaleDateString("en-US", { day: "numeric" });
  return `${fmtFull(start)} – ${sameMonth ? fmtDay(end) : fmtFull(end)}`;
}
