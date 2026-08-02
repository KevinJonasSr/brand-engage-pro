import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gatherWeeklyRecap } from "@/lib/personal-recap/gather";
import { generateHypeLine } from "@/lib/personal-recap/hype";

export const dynamic = "force-dynamic";

/**
 * Member weekly recap — the member-facing "your week" page. Reuses the
 * same gather that powers the weekly recap email, plus an AI hype line.
 */
export default async function MemberRecapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/recap");

  const recap = await gatherWeeklyRecap(user.id);
  const hype = await generateHypeLine(recap);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-xs uppercase tracking-widest text-white/50">
        Your last 7 days
        {recap.topBrandName ? ` · ${recap.topBrandName}` : ""}
      </p>
      <h1
        className="mt-2 text-3xl font-bold text-white"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Your weekly recap
      </h1>
      <p className="mt-3 text-lg text-white/80">{hype}</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Big label="Points earned" value={recap.pointsEarned} />
        <Big label="Current streak" value={recap.currentStreakDays} suffix="d" />
        <Big label="Comments" value={recap.commentsAdded} />
        <Big label="Reactions" value={recap.reactionsGiven} />
      </div>

      {recap.rsvpsAdded > 0 && (
        <p className="mt-6 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
          You RSVPed to {recap.rsvpsAdded} event
          {recap.rsvpsAdded === 1 ? "" : "s"} this week — see you there. 🎟️
        </p>
      )}

      {!recap.hasActivity && (
        <p className="mt-6 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/60">
          Nothing logged this week yet — a visit, a comment, or a check-in
          gets your streak moving again.
        </p>
      )}

      <div className="mt-12 flex flex-wrap items-center gap-4">
        <Link
          href={
            recap.topBrandSlug ? `/brands/${recap.topBrandSlug}` : "/brands"
          }
          className="rounded-xl bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white"
        >
          Keep the streak going →
        </Link>
        <Link href="/rewards" className="text-sm text-white/60 hover:text-white">
          Spend your points
        </Link>
        <Link href="/me" className="text-sm text-white/60 hover:text-white">
          Back to my profile
        </Link>
      </div>
    </main>
  );
}

function Big({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {value.toLocaleString()}
        {suffix}
      </p>
    </div>
  );
}
