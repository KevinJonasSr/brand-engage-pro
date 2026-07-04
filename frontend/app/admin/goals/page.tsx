import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, getAdminCommunityId } from "@/lib/admin";
import { computeGoalProgress, type BrandGoal } from "@/lib/goals/progress";
import { createGoalAction, toggleGoalActiveAction } from "./actions";

export const dynamic = "force-dynamic";

const METRIC_LABELS: Record<string, string> = {
  ledger_count: "Activity count (ledger rows by source)",
  member_count: "Total members",
  points_sum: "Points earned",
};

export default async function GoalsAdminPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/goals");

  const communityId = await getAdminCommunityId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_goals")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false });

  const goals = await Promise.all(
    ((data ?? []) as BrandGoal[]).map(computeGoalProgress),
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/50">Admin</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">Brand Goals</h1>
        <p className="mt-2 text-sm text-white/60">
          Rally your members around a shared target — check-ins, signups,
          points. Active goals show live progress on the brand page and get
          a shareable progress card.
        </p>
      </div>

      {/* New goal */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-5">
        <h2 className="text-sm font-semibold text-white">Create a goal</h2>
        <form action={createGoalAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-white/50">Title</span>
            <input
              type="text"
              name="title"
              required
              placeholder="500 check-ins this month"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-white/50">
              Description (optional)
            </span>
            <input
              type="text"
              name="description"
              placeholder="Hit the target and everyone unlocks a bonus drop"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/50">Metric</span>
            <select
              name="metric"
              defaultValue="ledger_count"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
            >
              <option value="ledger_count">Activity count (by source)</option>
              <option value="member_count">Total members</option>
              <option value="points_sum">Points earned</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/50">
              Source filter (e.g. checkin, referral — optional)
            </span>
            <input
              type="text"
              name="metric_ref"
              placeholder="checkin"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/50">Target</span>
            <input
              type="number"
              name="target"
              required
              min={1}
              placeholder="500"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/50">
              Ends (optional)
            </span>
            <input
              type="date"
              name="ends_at"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Create goal
            </button>
          </div>
        </form>
      </div>

      {/* Goal list */}
      <div className="space-y-4">
        {goals.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/60">
            No goals yet — create your first one above.
          </p>
        )}
        {goals.map((g) => (
          <div
            key={g.id}
            className="rounded-2xl border border-white/10 bg-black/40 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {g.title}
                  {g.completed && <span className="ml-2">🏆</span>}
                </h3>
                <p className="mt-0.5 text-xs text-white/50">
                  {METRIC_LABELS[g.metric] ?? g.metric}
                  {g.metric_ref ? ` · source: ${g.metric_ref}` : ""}
                  {g.ends_at
                    ? ` · ends ${new Date(g.ends_at).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  g.active
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-white/10 text-white/50"
                }`}
              >
                {g.active ? "ACTIVE" : "HIDDEN"}
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">
                  {g.current.toLocaleString()} / {g.target.toLocaleString()}
                </span>
                <span className="font-semibold text-white">{g.pct}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-400 to-orange-400"
                  style={{ width: `${Math.max(2, g.pct)}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
              <Link
                href={`/share/goal/${g.community_id}/${g.id}`}
                className="text-xs text-white/50 hover:text-white"
              >
                Share card →
              </Link>
              <form action={toggleGoalActiveAction} className="ml-auto">
                <input type="hidden" name="id" value={g.id} />
                <input
                  type="hidden"
                  name="active"
                  value={g.active ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                >
                  {g.active ? "Hide" : "Activate"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
