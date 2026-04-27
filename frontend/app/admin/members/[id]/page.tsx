import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminSuspendMemberAction } from "@/app/admin/community/actions";
import ModerationButton from "@/app/admin/community/moderation-button";

export const dynamic = "force-dynamic";

async function loadMember(id: string) {
  const admin = createAdminClient();
  const [memberRes, ledgerRes, badgesRes, postsRes, commentsRes, entriesRes, referralsRes] = await Promise.all([
    admin.from("members").select("*").eq("id", id).maybeSingle(),
    admin
      .from("points_ledger")
      .select("delta,source,source_ref,note,created_at")
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("member_badges")
      .select("badge_slug,earned_at,badges(slug,name,icon,category)")
      .eq("member_id", id),
    admin
      .from("community_posts")
      .select("id,brand_slug,kind,body,created_at")
      .eq("author_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("community_comments")
      .select("id,post_id,body,created_at")
      .eq("author_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("community_challenge_entries")
      .select("id,post_id,body,created_at")
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("referrals")
      .select("id,referred_email,status,points_awarded,created_at,verified_at")
      .eq("referrer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!memberRes.data) return null;
  return {
    member: memberRes.data,
    ledger: ledgerRes.data ?? [],
    badges: badgesRes.data ?? [],
    posts: postsRes.data ?? [],
    comments: commentsRes.data ?? [],
    entries: entriesRes.data ?? [],
    referrals: referralsRes.data ?? [],
  };
}

export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadMember(id);
  if (!data) notFound();
  const { member, ledger, badges, posts, comments, entries, referrals } = data;

  return (
    <div className="space-y-6">
      <Link href="/admin/members" className="text-xs text-white/60 hover:text-white">
        ← Back to members
      </Link>

      {/* Header */}
      <section className="glass-card flex flex-wrap items-start gap-4 p-6">
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatar_url as string}
            alt=""
            className="h-16 w-16 rounded-full border border-white/10 object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-ember text-xl font-bold">
            {(member.first_name?.[0] ?? member.email?.[0] ?? "F").toString().toUpperCase()}
          </span>
        )}
        <div className="flex-1 space-y-1">
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {member.first_name ?? "Unnamed member"}
          </h1>
          <p className="text-sm text-white/70">{member.email}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-2 py-0.5">
              Tier: <span className="font-semibold capitalize">{member.current_tier}</span>
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5">
              {(member.total_points ?? 0).toLocaleString()} pts
            </span>
            {member.city && (
              <span className="rounded-full bg-white/10 px-2 py-0.5">{member.city}</span>
            )}
            {member.suspended && (
              <span className="rounded-full bg-rose-500/30 px-2 py-0.5 text-rose-200">
                Suspended
              </span>
            )}
          </div>
        </div>
        <ModerationButton
          action={adminSuspendMemberAction}
          fields={{
            member_id: member.id as string,
            suspend: member.suspended ? "false" : "true",
          }}
          label={member.suspended ? "Unsuspend" : "Suspend"}
          confirmMessage={
            member.suspended
              ? "Lift the suspension on this member?"
              : "Suspend this member? They won't be able to post or comment until unsuspended."
          }
          className={`rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
            member.suspended
              ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
              : "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
          }`}
        />
      </section>

      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "Badges", v: badges.length },
          { l: "Posts", v: posts.length },
          { l: "Comments", v: comments.length },
          { l: "Referrals", v: referrals.length },
        ].map((k) => (
          <div key={k.l} className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">{k.l}</p>
            <p className="mt-1 text-2xl font-semibold">{k.v}</p>
          </div>
        ))}
      </section>

      {/* Badges */}
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="mb-3 text-sm font-semibold">Badges earned</p>
        {badges.length === 0 ? (
          <p className="text-xs text-white/50">No badges yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => {
              const meta = Array.isArray(b.badges) ? b.badges[0] : b.badges;
              return (
                <span
                  key={b.badge_slug as string}
                  className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs"
                >
                  <span>{(meta?.icon as string) ?? "🏅"}</span>
                  <span>{(meta?.name as string) ?? b.badge_slug}</span>
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* Ledger */}
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="mb-3 text-sm font-semibold">Points ledger · {ledger.length}</p>
        {ledger.length === 0 ? (
          <p className="text-xs text-white/50">No ledger entries.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {ledger.map((l, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="text-white/80">{l.note ?? l.source}</p>
                  <p className="text-white/40">
                    {new Date(l.created_at as string).toLocaleString()} · {l.source}
                  </p>
                </div>
                <p
                  className={
                    (l.delta as number) >= 0
                      ? "font-semibold text-emerald-300"
                      : "font-semibold text-rose-300"
                  }
                >
                  {(l.delta as number) >= 0 ? "+" : ""}
                  {l.delta as number} pts
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Activity */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="mb-2 text-sm font-semibold">Posts · {posts.length}</p>
          <div className="space-y-2 text-xs text-white/70">
            {posts.length === 0 && <p className="text-white/40">None.</p>}
            {posts.map((p) => (
              <p key={p.id as string} className="line-clamp-2">
                <span className="text-white/50">/{p.brand_slug as string} · {p.kind as string}</span>{" "}
                {p.body as string}
              </p>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="mb-2 text-sm font-semibold">Comments · {comments.length}</p>
          <div className="space-y-2 text-xs text-white/70">
            {comments.length === 0 && <p className="text-white/40">None.</p>}
            {comments.map((c) => (
              <p key={c.id as string} className="line-clamp-2">{c.body as string}</p>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="mb-2 text-sm font-semibold">Challenge entries · {entries.length}</p>
          <div className="space-y-2 text-xs text-white/70">
            {entries.length === 0 && <p className="text-white/40">None.</p>}
            {entries.map((e) => (
              <p key={e.id as string} className="line-clamp-2">{(e.body as string) ?? "(image only)"}</p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
