import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function loadAnalytics() {
  const admin = createAdminClient();
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    membersAll, members7, members30,
    postsAll, posts7,
    commentsAll, comments7,
    pollVotes, entries,
    ledgerRes,
    topReferrersRes,
    byBrandRes,
    actionCompletionsRes,
  ] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }),
    admin.from("members").select("id", { count: "exact", head: true }).gte("created_at", since7),
    admin.from("members").select("id", { count: "exact", head: true }).gte("created_at", since30),
    admin.from("community_posts").select("id", { count: "exact", head: true }),
    admin.from("community_posts").select("id", { count: "exact", head: true }).gte("created_at", since7),
    admin.from("community_comments").select("id", { count: "exact", head: true }),
    admin.from("community_comments").select("id", { count: "exact", head: true }).gte("created_at", since7),
    admin.from("community_poll_votes").select("post_id", { count: "exact", head: true }),
    admin.from("community_challenge_entries").select("id", { count: "exact", head: true }),
    admin.from("points_ledger").select("delta"),
    admin
      .from("referrals")
      .select("referrer_id,status,members!referrals_referrer_id_fkey(first_name)")
      .eq("status", "verified"),
    admin.from("community_posts").select("brand_slug"),
    admin.from("member_action_completions").select("member_id", { count: "exact", head: true }),
  ]);

  const totalPoints = (ledgerRes.data ?? []).reduce(
    (a: number, r: { delta: number }) => a + (r.delta ?? 0),
    0,
  );

  const referralCounts = new Map<string, { name: string | null; count: number }>();
  for (const r of topReferrersRes.data ?? []) {
    const id = r.referrer_id as string;
    const existing = referralCounts.get(id);
    const memberName = Array.isArray(r.members)
      ? (r.members[0]?.first_name as string | null) ?? null
      : (r.members as { first_name: string | null } | null)?.first_name ?? null;
    if (existing) existing.count += 1;
    else referralCounts.set(id, { name: memberName, count: 1 });
  }
  const topReferrers = [...referralCounts.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const byBrand = new Map<string, number>();
  for (const row of byBrandRes.data ?? []) {
    const a = row.brand_slug as string;
    byBrand.set(a, (byBrand.get(a) ?? 0) + 1);
  }
  const topBrands = [...byBrand.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    membersAll: membersAll.count ?? 0,
    members7: members7.count ?? 0,
    members30: members30.count ?? 0,
    postsAll: postsAll.count ?? 0,
    posts7: posts7.count ?? 0,
    commentsAll: commentsAll.count ?? 0,
    comments7: comments7.count ?? 0,
    pollVotes: pollVotes.count ?? 0,
    entries: entries.count ?? 0,
    totalPoints,
    topReferrers,
    topBrands,
    actionCompletions: actionCompletionsRes.count ?? 0,
  };
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-white/50">{sub}</p>}
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const a = await loadAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Analytics
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Quick health check on the member base. Rollups are live — no cached counts.
        </p>
      </div>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">Members</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard label="Total members" value={a.membersAll} />
          <KpiCard label="New · 7d" value={a.members7} sub={a.members7 === 0 ? "No signups yet this week" : undefined} />
          <KpiCard label="New · 30d" value={a.members30} />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">Community</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Posts total" value={a.postsAll} sub={`${a.posts7} past 7d`} />
          <KpiCard label="Comments total" value={a.commentsAll} sub={`${a.comments7} past 7d`} />
          <KpiCard label="Poll votes" value={a.pollVotes} />
          <KpiCard label="Challenge entries" value={a.entries} />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">Points + CTAs</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard label="Points issued (all-time)" value={a.totalPoints.toLocaleString()} />
          <KpiCard label="CTA completions" value={a.actionCompletions} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="mb-3 text-sm font-semibold">Top referrers</p>
          {a.topReferrers.length === 0 ? (
            <p className="text-xs text-white/50">No verified referrals yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {a.topReferrers.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <Link
                    href={`/admin/members/${r.id}`}
                    className="text-white/80 hover:text-white"
                  >
                    {r.name ?? "Anonymous"}
                  </Link>
                  <span className="text-white/70">{r.count} verified</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="mb-3 text-sm font-semibold">Most active brands (by post count)</p>
          {a.topBrands.length === 0 ? (
            <p className="text-xs text-white/50">No community activity yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {a.topBrands.map((row) => (
                <div
                  key={row.slug}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <Link
                    href={`/brands/${row.slug}/community`}
                    className="text-white/80 hover:text-white"
                  >
                    /{row.slug}
                  </Link>
                  <span className="text-white/70">{row.count} posts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
