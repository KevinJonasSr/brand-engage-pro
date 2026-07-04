import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { getBrandFromDb } from "@/lib/data/brands";
import { getGoalWithProgress } from "@/lib/goals/progress";
import ShareButton from "@/components/share-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; goalId: string }>;
}): Promise<Metadata> {
  const { slug, goalId } = await params;
  const [brand, goal] = await Promise.all([
    getBrandFromDb(slug).catch(() => null),
    getGoalWithProgress(goalId),
  ]);
  const brandName = brand?.name ?? "Brand Engage Pro";
  const title = goal
    ? `${goal.title} — ${goal.pct}% there`
    : `${brandName} community goal`;
  const description = goal
    ? `The ${brandName} member community is ${goal.pct}% of the way to "${goal.title}" on Brand Engage Pro. Join in and push it over the line.`
    : `Community goals with ${brandName} on Brand Engage Pro.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/goal/${slug}/${goalId}`,
      siteName: "Brand Engage Pro",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GoalSharePage({
  params,
}: {
  params: Promise<{ slug: string; goalId: string }>;
}) {
  const { slug, goalId } = await params;
  const [brand, goal] = await Promise.all([
    getBrandFromDb(slug).catch(() => null),
    getGoalWithProgress(goalId),
  ]);
  if (!brand || !goal || goal.community_id !== slug || !goal.active) notFound();

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/goal/${slug}/${goalId}`
      : `https://brand-engage-pro.vercel.app/share/goal/${slug}/${goalId}`;
  const shareTitle = goal.completed
    ? `We did it — "${goal.title}" with ${brand.name}!`
    : `Help ${brand.name} hit "${goal.title}"`;
  const shareText = goal.completed
    ? `The ${brand.name} member community just hit its goal: ${goal.title}. ${shareUrl}`
    : `The ${brand.name} community is ${goal.pct}% of the way to "${goal.title}" on Brand Engage Pro. Jump in: ${shareUrl}`;

  return (
    <main className="min-h-screen bg-[#050b1f] text-white flex flex-col items-center justify-center px-6 py-16">
      <div
        className="w-full max-w-lg rounded-2xl border border-white/20 p-8 flex flex-col items-center gap-6 text-center"
        style={{
          background:
            `radial-gradient(circle at 20% 15%, ${brand.accentFrom}66, transparent 55%), ` +
            `radial-gradient(circle at 80% 85%, ${brand.accentTo}66, transparent 60%), ` +
            "rgba(255,255,255,0.03)",
          boxShadow: `0 0 60px ${brand.accentFrom}22`,
        }}
      >
        <p className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-medium">
          Brand Engage Pro
        </p>
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest uppercase text-white/50">
            {goal.completed ? "Goal complete 🏆" : "Community goal"}
          </p>
          <h1 className="text-2xl font-bold">{goal.title}</h1>
          <p className="text-white/60 text-sm mt-1">
            {brand.name} member community
          </p>
        </div>

        <div className="w-full">
          <div
            className="text-6xl font-extrabold leading-none"
            style={{
              background: `linear-gradient(135deg, ${brand.accentFrom}, ${brand.accentTo})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {goal.pct}%
          </div>
          <p className="mt-2 text-sm text-white/60">
            {goal.current.toLocaleString()} of {goal.target.toLocaleString()}
          </p>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, goal.pct)}%`,
                background: `linear-gradient(90deg, ${brand.accentFrom}, ${brand.accentTo})`,
              }}
            />
          </div>
        </div>

        {goal.description && (
          <p className="text-white/60 text-sm max-w-xs">{goal.description}</p>
        )}

        <ShareButton
          title={shareTitle}
          text={shareText}
          url={shareUrl}
          label={goal.completed ? "Share the win" : "Share this goal"}
          variant="primary"
        />
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link
          href={`/brands/${brand.slug}`}
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          Visit brand experience →
        </Link>
        <p className="text-xs text-white/30 max-w-xs text-center">
          Join {brand.name}&apos;s community on Brand Engage Pro and help push
          this over the line.
        </p>
      </div>
    </main>
  );
}
