import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listBrandsFromDb } from "@/lib/data/brands";
import MyBrandsSection from "@/components/my-brands-section";
import { buildMyBrands } from "@/components/brand-directory-helpers";

export const metadata = { title: "Account" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  // "My brands": follows (own rows via RLS) + per-community tier. Both
  // tables are kept in sync by migration 0081, so the union is belt and
  // braces. Any failure falls back to an empty list rather than a 500.
  const myBrands = await loadMyBrands(user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-iron/70">
          Your account
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Me</h1>
        <p className="mt-3 text-iron/70">
          Manage your profile, notifications, and history.
        </p>
      </header>

      <MyBrandsSection items={myBrands} />

      <ul className="space-y-3">
        <Row
          href="/inbox"
          title="Inbox"
          body="Recent notifications, badges, and milestones."
        />
        <Row
          href="/me/notifications"
          title="Notification preferences"
          body="Choose which drops, predictions, and milestones we ping you about."
        />
        <Row
          href="/me/privacy"
          title="Privacy"
          body="Control whether your profile is publicly viewable. Email, phone, and address are always private."
        />
        <Row
          href="/me/birthday"
          title="Birthday"
          body="Set your birthday month to unlock birthday perks from the brands you follow."
        />
        <Row
          href="/me/anniversaries"
          title="Anniversaries"
          body="Every milestone with a community you follow."
        />
        <Row
          href="/rewards"
          title="Rewards & tiers"
          body="Your tier, badges, and points history."
        />
        <Row
          href="/me/card"
          title="Member card"
          body="Your shareable loyalty card — tier, points, and streak at a glance."
        />
        <Row
          href="/me/billing"
          title="Billing"
          body="Manage Premium: update your card, see invoices, or cancel."
        />
        <Row
          href="/referrals"
          title="Referrals"
          body="Invite friends — earn points when they join."
        />
      </ul>
    </main>
  );
}

async function loadMyBrands(userId: string) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const [brands, followsRes, membershipsRes] = await Promise.all([
      listBrandsFromDb(),
      supabase
        .from("member_brand_following")
        .select("brand_slug")
        .eq("member_id", userId),
      admin
        .from("member_community_memberships")
        .select("community_id, current_tier")
        .eq("member_id", userId)
        .eq("status", "active"),
    ]);
    return buildMyBrands(
      brands,
      (followsRes.data ?? []) as Array<{ brand_slug: string }>,
      (membershipsRes.data ?? []) as Array<{
        community_id: string;
        current_tier: string | null;
      }>,
    );
  } catch (err) {
    console.warn("/me: loadMyBrands failed", err);
    return [];
  }
}

function Row({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between rounded-xl border border-iron/10 bg-iron/[0.02] p-4 transition hover:border-iron/20 hover:bg-iron/[0.04]"
      >
        <div>
          <div className="font-medium">{title}</div>
          <div className="mt-0.5 text-sm text-iron/70">{body}</div>
        </div>
        <span aria-hidden className="text-iron/70">
          →
        </span>
      </Link>
    </li>
  );
}
