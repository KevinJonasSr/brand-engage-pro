import { headers } from "next/headers";
import Link from "next/link";
import { getCurrentMember } from "@/lib/data/member";
import { getMyReferrals, getReferralLeaderboard } from "@/lib/data/referrals";
import InviteQRCode from "@/components/invite-qr";
import CopyLinkButton from "./copy-link-button";
import PreviewSignupBanner from "@/components/preview-signup-banner";
import NativeShareButton from "./native-share-button";

// Restaurant loyalty milestones — no music leftovers (e.g. “VIP livestream”).
const ladder = [
  { level: "1 referral", reward: "+150 pts" },
  { level: "3 referrals", reward: "Referral badge" },
  { level: "5 referrals", reward: "Bonus point boost" },
  { level: "10 referrals", reward: "Top-referrer recognition" },
];

async function buildInviteUrl(code: string | null | undefined): Promise<string> {
  const headerList = await headers();
  const host =
    process.env.NEXT_PUBLIC_APP_URL ??
    (headerList.get("x-forwarded-host") ?? headerList.get("host"));
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host?.startsWith("http") ? host : `${proto}://${host}`;
  if (!code) return `${origin}/invite/your-code`;
  return `${origin}/invite/${code}`;
}

export const metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const [member, myReferrals, leaderboard] = await Promise.all([
    getCurrentMember(),
    getMyReferrals(),
    getReferralLeaderboard(5),
  ]);

  const isSignedIn = member !== null;
  const inviteUrl = await buildInviteUrl(member?.referral_code);
  const myCount = myReferrals.length;

  const leaderboardRows = isSignedIn
    ? leaderboard.map((row) => ({
        name: row.display_name,
        total: `${row.referral_count} referral${row.referral_count === 1 ? "" : "s"}`,
      }))
    : [];

  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row">
        <div className="flex-1 space-y-6">
          {!isSignedIn && (
            <PreviewSignupBanner
              eyebrow="🎟️ Referrals"
              headline="Invite friends — earn +150 pts per signup"
              body="Create a free account to get your personal invite link. You earn +150 points for each friend who joins with it. New accounts start at 0 — no sample totals here."
              bullets={[
                "+150 pts every verified signup",
                "Milestones unlock badges as you go",
                "Share Nellie's or Jonas Group Entertainment with people you actually know",
              ]}
              primaryCta="Sign up to get my link →"
              nextPath="/referrals"
              firstRewardLine="🎁 Earn +150 pts the first time someone uses your link."
            />
          )}

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-900/30 via-slate-900 to-midnight p-6 shadow-glass">
            <p className="text-sm uppercase tracking-wide text-white/60">Referrals</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Bring the regulars in
            </h1>
            <p className="mt-4 text-sm text-white/70">
              {isSignedIn
                ? `You've invited ${myCount} member${myCount === 1 ? "" : "s"} so far. Keep sharing to climb the ladder.`
                : "Create an account to get a personal invite link. Your referral count starts at 0."}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {isSignedIn ? (
                <>
                  <code className="flex-1 rounded-2xl bg-black/40 px-4 py-3 text-sm">{inviteUrl}</code>
                  <CopyLinkButton url={inviteUrl} />
                  <NativeShareButton url={inviteUrl} />
                </>
              ) : (
                <Link
                  href="/signup?next=/referrals"
                  className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Sign up for your invite link →
                </Link>
              )}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-white/60">Reward ladder</p>
              <div className="mt-4 space-y-4">
                {ladder.map((step, i) => {
                  const threshold = [1, 3, 5, 10][i];
                  const unlocked = isSignedIn && myCount >= threshold;
                  return (
                    <div
                      key={step.level}
                      className={`rounded-2xl p-4 ${
                        unlocked ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-black/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{step.level}</p>
                          <p className="text-xs text-white/60">{step.reward}</p>
                        </div>
                        {unlocked && (
                          <span className="text-xs font-medium text-emerald-300">Unlocked</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-white/60">Top referrers</p>
              {leaderboardRows.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {leaderboardRows.map((row) => (
                    <li
                      key={row.name}
                      className="flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3 text-sm"
                    >
                      <span>{row.name}</span>
                      <span className="text-white/60">{row.total}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-xs text-white/60">
                  {isSignedIn
                    ? "No referral leaders yet — be the first."
                    : "Leaderboard stays empty for guests. Sign up to earn real referral counts (start at 0)."}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="w-full max-w-sm space-y-6">
          {isSignedIn && member?.referral_code && (
            <section className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-white/60">Your QR</p>
              <div className="mt-4 flex justify-center">
                <InviteQRCode url={inviteUrl} />
              </div>
              <p className="mt-4 break-all text-center text-xs text-white/50">{inviteUrl}</p>
            </section>
          )}

          <section className="glass-card p-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Recent activity</p>
            {isSignedIn ? (
              myReferrals.length > 0 ? (
                <ul className="mt-4 space-y-3 text-sm text-white/70">
                  {myReferrals.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      • {r.referred_email ?? "Invite"} — {r.status}
                      {r.points_awarded ? ` (+${r.points_awarded} pts)` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-xs text-white/60">
                  No activity yet — share your invite link to get started.
                </div>
              )
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-xs text-white/60">
                No sample activity. After you join, real referrals appear here.
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
