import { headers } from "next/headers";
import Link from "next/link";
import { getCurrentMember } from "@/lib/data/member";
import { getMyReferrals, getReferralLeaderboard } from "@/lib/data/referrals";
import InviteQRCode from "@/components/invite-qr";
import CopyLinkButton from "./copy-link-button";
import PreviewSignupBanner from "@/components/preview-signup-banner";
import NativeShareButton from "./native-share-button";
import FirstSessionChecklist from "@/components/first-session-checklist";
import { getFirstSessionFacts } from "@/lib/data/first-session";
import {
  FIRST_SESSION_BLURB,
  FIRST_SESSION_EYEBROW,
} from "@/lib/first-session";

// Only list what the app pays today: the friend gets 50 pts at signup, and
// the inviter gets 150 pts once that friend makes their first check-in
// (lib/referrals/first-visit.ts). There are no boosts for referral counts
// beyond that, so don't promise them.
const REFERRAL_VALUE_COPY =
  "Your friend gets 50 pts to start. You get 150 pts after their first visit.";

const ladder = [
  { level: "1 first visit", reward: "+150 pts" },
  { level: "3 first visits", reward: "+450 pts total" },
  { level: "5 first visits", reward: "+750 pts total" },
  { level: "10 first visits", reward: "+1,500 pts total" },
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
  const [member, myReferrals, leaderboard, firstSession] = await Promise.all([
    getCurrentMember(),
    getMyReferrals(),
    getReferralLeaderboard(5),
    getFirstSessionFacts(),
  ]);

  const isSignedIn = member !== null;
  const inviteUrl = await buildInviteUrl(member?.referral_code);
  const myCount = myReferrals.length;
  // Ladder progress counts paid referrals: friends who have made a first visit.
  const qualifiedCount = myReferrals.filter((r) => r.status === "verified").length;
  const pendingCount = myCount - qualifiedCount;

  const leaderboardRows = isSignedIn
    ? leaderboard.map((row) => ({
        name: row.display_name,
        total: `${row.referral_count} referral${row.referral_count === 1 ? "" : "s"}`,
      }))
    : [];

  return (
    <div className="min-h-screen bg-linen">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row">
        <div className="flex-1 space-y-6">
          {!isSignedIn && (
            <PreviewSignupBanner
              eyebrow="🎟️ Referrals"
              headline="Invite friends. Both of you earn."
              body={`Create a free account to get your personal invite link. ${REFERRAL_VALUE_COPY} Every account starts at 0 points.`}
              bullets={[
                "Your friend gets +50 pts the moment they join with your link",
                "You get +150 pts after their first check-in",
                "Share Nellie's or Jonas Group Entertainment with people you actually know",
              ]}
              primaryCta="Sign up to get my link →"
              nextPath="/referrals"
              firstRewardLine="🎁 Earn +150 pts the first time an invited friend checks in."
            />
          )}

          <section className="rounded-lg border border-iron/10 bg-gradient-to-br from-aurora/20 via-parchment to-linen p-6 shadow-glass">
            <p className="text-sm uppercase tracking-wide text-iron/70">Referrals</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Bring the regulars in
            </h1>
            <p className="mt-4 text-sm text-iron/70">
              {isSignedIn
                ? `You've invited ${myCount} member${myCount === 1 ? "" : "s"} so far${
                    pendingCount > 0
                      ? ` — ${pendingCount} still ${pendingCount === 1 ? "has" : "have"} a first visit to make`
                      : ""
                  }. Keep sharing to climb the ladder.`
                : "Create an account to get a personal invite link. Your referral count starts at 0."}
            </p>
            <p className="mt-2 text-sm font-medium text-iron">{REFERRAL_VALUE_COPY}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {isSignedIn ? (
                <>
                  <code className="flex-1 rounded-lg bg-parchment/40 px-4 py-3 text-sm">{inviteUrl}</code>
                  <CopyLinkButton url={inviteUrl} />
                  <NativeShareButton url={inviteUrl} />
                </>
              ) : (
                <Link
                  href="/signup?next=/referrals"
                  className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-linen"
                >
                  Sign up for your invite link →
                </Link>
              )}
            </div>
          </section>

          {isSignedIn && firstSession ? (
            <FirstSessionChecklist facts={firstSession} />
          ) : (
            <section className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-iron/70">
                {FIRST_SESSION_EYEBROW}
              </p>
              <p className="mt-2 text-sm text-iron/70">{FIRST_SESSION_BLURB}</p>
            </section>
          )}

          <section className="grid gap-6 md:grid-cols-2">
            <div className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-iron/70">Reward ladder</p>
              <div className="mt-4 space-y-4">
                {ladder.map((step, i) => {
                  const threshold = [1, 3, 5, 10][i];
                  const unlocked = isSignedIn && qualifiedCount >= threshold;
                  return (
                    <div
                      key={step.level}
                      className={`rounded-lg p-4 ${
                        unlocked ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-parchment/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{step.level}</p>
                          <p className="text-xs text-iron/70">{step.reward}</p>
                        </div>
                        {unlocked && (
                          <span className="text-xs font-medium text-sage-ink">Unlocked</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-iron/70">Top referrers</p>
              {leaderboardRows.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {leaderboardRows.map((row) => (
                    <li
                      key={row.name}
                      className="flex items-center justify-between rounded-lg bg-parchment/30 px-4 py-3 text-sm"
                    >
                      <span>{row.name}</span>
                      <span className="text-iron/70">{row.total}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-iron/15 bg-parchment/20 p-6 text-center text-xs text-iron/70">
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
              <p className="text-sm uppercase tracking-wide text-iron/70">Your QR</p>
              <div className="mt-4 flex justify-center">
                <InviteQRCode url={inviteUrl} />
              </div>
              <p className="mt-4 break-all text-center text-xs text-iron/70">{inviteUrl}</p>
            </section>
          )}

          <section className="glass-card p-6">
            <p className="text-sm uppercase tracking-wide text-iron/70">Recent activity</p>
            {isSignedIn ? (
              myReferrals.length > 0 ? (
                <ul className="mt-4 space-y-3 text-sm text-iron/70">
                  {myReferrals.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      • {r.referred_email ?? "Invite"} —{" "}
                      {r.status === "verified"
                        ? "first visit made"
                        : r.status === "pending"
                          ? "joined, first visit pending"
                          : r.status}
                      {r.points_awarded ? ` (+${r.points_awarded} pts)` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-iron/15 bg-parchment/20 p-6 text-center text-xs text-iron/70">
                  No activity yet — share your invite link to get started.
                </div>
              )
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-iron/15 bg-parchment/20 p-6 text-center text-xs text-iron/70">
                No sample activity. After you join, real referrals appear here.
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
