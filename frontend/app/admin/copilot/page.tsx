import { redirect } from "next/navigation";
import { getAdminContext, getAdminCommunityId, roleAtLeast } from "@/lib/admin";
import { getLatestBrief, generateBrief } from "@/lib/copilot/generate";
import { refreshBriefAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/copilot");

  const communityId = await getAdminCommunityId();

  // First visit generates one (cooldown-aware); after that we show latest.
  const brief =
    (await getLatestBrief(communityId)) ?? (await generateBrief(communityId));

  const pulse = brief.pulse;
  const generated = new Date(brief.generatedAt);
  const canRefresh = ctx.isSuperAdmin || roleAtLeast(ctx.role, "editor");

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Copilot ✨</h1>
          <p className="text-sm text-white/60">
            AI briefing on your member community — what happened, who to
            watch, what to do next.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/50">
          <span>
            Updated{" "}
            {generated.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {brief.fallback && " · offline summary"}
          </span>
          {canRefresh && (
            <form action={refreshBriefAction}>
              <button
                type="submit"
                className="rounded-lg border border-white/15 px-3 py-1.5 font-medium text-white/80 hover:border-white/30 hover:text-white"
              >
                Refresh
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-purple-400/30 bg-purple-400/10 px-5 py-4">
        <p className="text-lg font-semibold text-white">{brief.headline}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Members" value={pulse.memberCount} />
        <Stat label="New (7d)" value={pulse.newMembers7d} />
        <Stat label="Active (7d)" value={pulse.activeMembers7d} />
        <Stat label="Points (7d)" value={pulse.pointsAwarded7d} />
        <Stat label="Posts (7d)" value={pulse.posts7d} />
        <Stat label="Comments (7d)" value={pulse.comments7d} />
      </div>

      {brief.insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            This week
          </h2>
          <ul className="space-y-2">
            {brief.insights.map((line, i) => (
              <li
                key={i}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80"
              >
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.actions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            Recommended actions
          </h2>
          <div className="space-y-3">
            {brief.actions.map((a, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-black/40 p-4"
              >
                <p className="font-semibold text-white">{a.title}</p>
                <p className="mt-1 text-sm text-white/60">{a.why}</p>
                {a.suggestedPost && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="mb-1 text-xs uppercase tracking-wide text-white/40">
                      Suggested post — copy, tweak, publish
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-white/80">
                      {a.suggestedPost}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
          Members going quiet{" "}
          <span className="normal-case text-white/40">
            (engaged before, silent 14+ days)
          </span>
        </h2>
        {pulse.quietMembers.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/60">
            No churn-risk members right now — everyone with meaningful points
            has been active recently. 🎉
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-4 py-2">Member</th>
                  <th className="px-4 py-2">Points</th>
                  <th className="px-4 py-2">Quiet for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-black/30">
                {pulse.quietMembers.map((m) => (
                  <tr key={m.memberId}>
                    <td className="px-4 py-2 text-white/80">
                      {m.displayName ?? "Member"}
                    </td>
                    <td className="px-4 py-2 text-white/60">
                      {m.totalPoints.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-amber-300/80">
                      {m.daysQuiet} days
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
