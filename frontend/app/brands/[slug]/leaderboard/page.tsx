import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { gatherBrandLeaderboard } from "@/lib/leaderboard/gather";
import LeaderboardPodium from "@/components/leaderboard-podium";
import LeaderboardList from "@/components/leaderboard-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Per-brand monthly leaderboard. Renders:
 *   - Header with brand name + month label + reset hint
 *   - Top-3 podium
 *   - Ranks 4–10 list
 *   - Viewer's "You're #N" pill (if signed in and on the board)
 *   - Empty state when nothing has happened yet this month
 *   - "What counts" footer explaining the scoring weights
 */
export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const board = await gatherBrandLeaderboard({
    brandSlug: slug,
    viewerMemberId: user?.id ?? null,
    topN: 10,
  });
  if (!board) notFound();

  const podiumEntries = board.top.filter((e) => e.rank <= 3);
  const restEntries = board.top.filter((e) => e.rank > 3);
  const viewerOnBoard = board.viewerEntry !== null;
  const viewerInTop10 = viewerOnBoard && (board.viewerEntry as { rank: number }).rank <= 10;

  // Month-end hint
  const monthStart = new Date(board.monthStart);
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  const daysLeft = Math.max(
    0,
    Math.ceil((monthEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-8 text-center">
        <Link
          href={`/brands/${slug}`}
          className="text-xs uppercase tracking-[0.25em] text-white/55 hover:text-white"
        >
          ← {board.brandName}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Top members this month
        </h1>
        <p className="mt-2 text-sm text-white/65">
          {board.monthLabel} ·{" "}
          {daysLeft > 0
            ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
            : "ends today"}{" "}
          · resets on the 1st
        </p>
      </header>

      {board.top.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-base font-medium text-white">No activity yet</p>
          <p className="mt-1 text-sm text-white/55">
            Be the first to top the chart — react to a post, RSVP an event, or
            redeem a reward.
          </p>
        </div>
      ) : (
        <>
          {/* Podium */}
          <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-amber-500/5 via-violet-500/5 to-rose-500/5 p-5 sm:p-6">
            <LeaderboardPodium
              entries={podiumEntries}
              viewerMemberId={user?.id ?? null}
            />
          </section>

          {/* Ranks 4–10 */}
          {restEntries.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                Climbers
              </h2>
              <LeaderboardList
                entries={restEntries}
                viewerMemberId={user?.id ?? null}
              />
            </section>
          )}

          {/* Viewer's standing if they're below #10 */}
          {viewerOnBoard && !viewerInTop10 && board.viewerEntry && (
            <section className="mt-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                Your standing
              </h2>
              <LeaderboardList
                entries={[board.viewerEntry]}
                viewerMemberId={user?.id ?? null}
              />
              <p className="mt-2 text-center text-xs text-white/55">
                You&apos;re #{board.viewerEntry.rank} of {board.totalMembers} members
                with activity this month.
              </p>
            </section>
          )}
        </>
      )}

      <footer className="mt-10 rounded-xl border border-white/5 bg-white/3 p-4 text-xs text-white/55">
        <p className="font-semibold uppercase tracking-wide text-white/65">
          How points are scored
        </p>
        <p className="mt-2 leading-relaxed">
          1 pt per reaction · 3 pts per comment · 5 pts per RSVP · 10 pts per
          redemption. Counts cap monthly — the chart resets at midnight UTC on
          the 1st of each month. Only activity inside this brand&apos;s
          community counts toward this leaderboard.
        </p>
      </footer>
    </div>
  );
}
