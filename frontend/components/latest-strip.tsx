import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type CardKind = "post" | "event" | "drop" | "prediction";

type LatestCard = {
  kind: CardKind;
  title: string;
  body?: string | null;
  href: string;
  /** ISO timestamp used for sorting + "X ago"/"in X" rendering */
  ts: string;
  /** "in 3d" / "5h ago" — pre-formatted */
  when: string;
};

const KIND_LABEL: Record<CardKind, string> = {
  post: "POST",
  event: "EVENT",
  drop: "DROP",
  prediction: "PREDICTION",
};

const KIND_COLOR: Record<CardKind, string> = {
  post: "text-fuchsia-300 border-fuchsia-300/30",
  event: "text-emerald-300 border-emerald-300/30",
  drop: "text-amber-300 border-amber-300/30",
  prediction: "text-sky-300 border-sky-300/30",
};

/**
 * <LatestStrip slug="raelynn" />  (FE)
 * <LatestStrip slug="nellies" />   (BEP)
 *
 * Repo-agnostic: tries FE table names first (artist_events, etc.),
 * then BEP names (brand_events, etc.). Whichever returns rows wins.
 */
export async function LatestStrip({ slug }: { slug: string }) {
  const cards = await collect(slug);
  if (cards.length === 0) return null;

  // Sort: future events first (closest first), then by recency.
  const sorted = cards
    .slice()
    .sort((a, b) => {
      const at = new Date(a.ts).getTime();
      const bt = new Date(b.ts).getTime();
      const now = Date.now();
      const aFuture = at >= now;
      const bFuture = bt >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return at - bt; // soonest future first
      return bt - at; // most recent past first
    })
    .slice(0, 3);

  // Don't show a lonely 1-card or 2-card strip — only render at 3.
  if (sorted.length < 3) return null;

  return (
    <section
      aria-label="Latest"
      className="mt-6"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-white/60">
          Latest
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {sorted.map((c, i) => (
          <Link
            key={c.kind + ":" + i + ":" + c.ts}
            href={c.href}
            className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/25 hover:bg-white/[0.04]"
          >
            <div className="mb-2 flex items-center justify-between">
              <span
                className={
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] tracking-widest " +
                  KIND_COLOR[c.kind]
                }
              >
                {KIND_LABEL[c.kind]}
              </span>
              <span className="text-xs text-white/40">{c.when}</span>
            </div>
            <div className="font-medium leading-snug group-hover:text-white">
              {c.title}
            </div>
            {c.body && (
              <p className="mt-1 line-clamp-2 text-sm text-white/60">
                {c.body}
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

async function collect(slug: string): Promise<LatestCard[]> {
  const supabase = await createClient();
  const cards: LatestCard[] = [];

  // ─── Resolve community/scope id from the slug ──────────────────────
  // FE: artists.slug → artists.id ; BEP: brands.slug → brands.slug (used as PK)
  let scopeId: string | null = null;
  for (const tbl of ["artists", "brands"]) {
    const { data } = await supabase
      .from(tbl)
      .select("id, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (data) {
      scopeId = (data as { id?: string; slug?: string }).id ??
        (data as { slug?: string }).slug ?? null;
      break;
    }
  }
  if (!scopeId) scopeId = slug; // fallback — many BEP tables key on slug directly

  // ─── community_posts (newest 5; filter pinned OR has reactions) ────
  for (const col of ["artist_id", "brand_slug", "community_id"]) {
    const { data, error } = await supabase
      .from("community_posts")
      .select("id, title, body, created_at, kind, is_prediction, pinned")
      .eq(col, col === "brand_slug" ? slug : scopeId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) continue;
    if (data && data.length > 0) {
      for (const p of data as Array<{
        id: string;
        title: string | null;
        body: string | null;
        created_at: string;
        kind: string | null;
        is_prediction: boolean | null;
        pinned: boolean | null;
      }>) {
        const kind: CardKind = p.is_prediction ? "prediction" : "post";
        cards.push({
          kind,
          title: p.title ?? truncate(p.body ?? "", 80) ?? "Community post",
          body: p.title ? truncate(p.body, 120) : null,
          href: hrefForCommunity(slug),
          ts: p.created_at,
          when: relTime(p.created_at),
        });
      }
      break;
    }
  }

  // ─── upcoming events ──────────────────────────────────────────────
  // FE shape:  artist_events.starts_at (timestamptz) + .description
  // BEP shape: brand_events.event_starts_at (timestamptz, may be null)
  //            + .detail + .event_date (legacy text for display fallback)
  let eventsAdded = false;

  {
    const { data, error } = await supabase
      .from("artist_events")
      .select("id, title, description, starts_at")
      .eq("artist_id", scopeId)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3);
    if (!error && data && data.length > 0) {
      for (const e of data as Array<{
        id: string;
        title: string;
        description: string | null;
        starts_at: string;
      }>) {
        cards.push({
          kind: "event",
          title: e.title,
          body: truncate(e.description, 120),
          href: hrefForHub(slug),
          ts: e.starts_at,
          when: relTime(e.starts_at),
        });
      }
      eventsAdded = true;
    }
  }

  if (!eventsAdded) {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("brand_events")
      .select("id, title, detail, event_starts_at, event_date")
      .eq("brand_slug", slug)
      .or(`event_starts_at.gte.${nowIso},event_starts_at.is.null`)
      .order("event_starts_at", { ascending: true, nullsFirst: false })
      .limit(3);
    if (!error && data && data.length > 0) {
      for (const e of data as Array<{
        id: string;
        title: string;
        detail: string | null;
        event_starts_at: string | null;
        event_date: string | null;
      }>) {
        const ts = e.event_starts_at ?? new Date().toISOString();
        const when = e.event_starts_at
          ? relTime(e.event_starts_at)
          : (e.event_date ?? "");
        cards.push({
          kind: "event",
          title: e.title,
          body: truncate(e.detail, 120),
          href: hrefForHub(slug),
          ts,
          when,
        });
      }
    }
  }

  // ─── drops landing soon (rewards.drops_at within next 7 days) ──────
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);
  for (const fkCol of ["artist_id", "brand_slug", "community_id"]) {
    const { data, error } = await supabase
      .from("rewards")
      .select("id, name, description, drops_at")
      .eq(fkCol, fkCol === "brand_slug" ? slug : scopeId)
      .not("drops_at", "is", null)
      .lte("drops_at", sevenDays.toISOString())
      .order("drops_at", { ascending: true })
      .limit(3);
    if (error) continue;
    if (data && data.length > 0) {
      for (const r of data as Array<{
        id: string;
        name: string;
        description: string | null;
        drops_at: string;
      }>) {
        cards.push({
          kind: "drop",
          title: r.name,
          body: truncate(r.description, 120),
          href: hrefForRewards(slug),
          ts: r.drops_at,
          when: relTime(r.drops_at),
        });
      }
      break;
    }
  }

  return cards;
}

// ─── tiny helpers (no external deps) ─────────────────────────────────

function truncate(s: string | null | undefined, n: number): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.length > n ? trimmed.slice(0, n - 1) + "…" : trimmed;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const now = Date.now();
  const diff = t - now;
  const ad = Math.abs(diff);
  const min = 60_000,
    hr = 60 * min,
    day = 24 * hr;
  if (ad < hr) {
    const m = Math.max(1, Math.round(ad / min));
    return diff > 0 ? `in ${m}m` : `${m}m ago`;
  }
  if (ad < day) {
    const h = Math.round(ad / hr);
    return diff > 0 ? `in ${h}h` : `${h}h ago`;
  }
  if (ad < 30 * day) {
    const d = Math.round(ad / day);
    return diff > 0 ? `in ${d}d` : `${d}d ago`;
  }
  // > 30 days — fall back to absolute
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function hrefForHub(slug: string): string {
  // FE uses /artists/[slug] ; BEP uses /brands/[slug] — try artists first.
  // (We can't easily detect the repo at runtime; the slug-based route on
  // FE matches /artists/<slug> and on BEP matches /brands/<slug>. We bet
  // on /artists for FE and re-write at the page layer if needed.)
  return `/brands/${slug}`;
}

function hrefForCommunity(slug: string): string {
  return `/brands/${slug}/community`;
}

function hrefForRewards(slug: string): string {
  return `/brands/${slug}/rewards`;
}
