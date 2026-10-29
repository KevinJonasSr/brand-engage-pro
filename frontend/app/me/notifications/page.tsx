import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { smsTierAllowed } from "@/lib/sms-send-gate";
import { getTiers } from "@/lib/data/tiers";
import { PreferencesForm } from "./preferences-form";
import { BrandMutes } from "./brand-mutes";
import {
  DEFAULT_PREFS,
  TOGGLE_KEYS,
  setBrandMuted,
  type BrandPref,
  type Prefs,
} from "./prefs";

export const metadata = { title: "Notifications" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREFS_SELECT = [...TOGGLE_KEYS, "quiet_start", "quiet_end"].join(", ");

// Postgres time comes back as 'HH:MM:SS'; <input type="time"> wants 'HH:MM'.
function toHhMm(value: unknown): string | null {
  return typeof value === "string" && value.length >= 5 ? value.slice(0, 5) : null;
}

export default async function NotificationPreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/notifications");

  const [
    { data: row },
    { data: pushSubs },
    { data: member },
    tiers,
    { data: follows },
    { data: mutes },
  ] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select(PREFS_SELECT)
      .eq("member_id", user.id)
      .maybeSingle(),
    supabase
      .from("push_subscriptions")
      .select("endpoint")
      .eq("member_id", user.id)
      .limit(1),
    supabase
      .from("members")
      .select("phone, current_tier, total_points")
      .eq("id", user.id)
      .maybeSingle(),
    getTiers(),
    // Followed brands, with the brand name via the brand_slug FK (0006).
    supabase
      .from("member_brand_following")
      .select("brand_slug, brands(name)")
      .eq("member_id", user.id),
    // Own rows only under RLS (0083); a missing row means "not muted".
    supabase
      .from("member_brand_notification_prefs")
      .select("brand_slug, muted")
      .eq("member_id", user.id),
  ]);

  const mutedSlugs = new Set(
    ((mutes ?? []) as Array<{ brand_slug: string; muted: boolean }>)
      .filter((m) => m.muted)
      .map((m) => m.brand_slug),
  );
  const followedBrands: BrandPref[] = (
    (follows ?? []) as Array<{
      brand_slug: string;
      brands: { name: string } | { name: string }[] | null;
    }>
  )
    .map((f) => {
      const b = Array.isArray(f.brands) ? f.brands[0] : f.brands;
      return {
        slug: f.brand_slug,
        name: b?.name ?? f.brand_slug,
        muted: mutedSlugs.has(f.brand_slug),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const stored = row as Partial<Record<string, unknown>> | null;
  const prefs: Prefs = stored
    ? {
        ...DEFAULT_PREFS,
        ...(stored as Partial<Prefs>),
        quiet_start: toHhMm(stored.quiet_start),
        quiet_end: toHhMm(stored.quiet_end),
      }
    : DEFAULT_PREFS;

  const hasPush = !!(pushSubs && pushSubs.length > 0);
  const hasEmail = !!user.email;
  const hasSms = !!member?.phone;

  const smsAllowed = smsTierAllowed(member?.current_tier as string | null);
  const goldMin = tiers.find((t) => t.slug === "gold")?.min_points ?? 0;
  const ptsToGold = Math.max(0, goldMin - (Number(member?.total_points) || 0));
  const smsCopy = `Reach Gold tier (${ptsToGold.toLocaleString("en-US")} pts to go) to unlock SMS alerts.`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <nav className="mb-6 text-sm">
        <Link href="/inbox" className="text-iron/70 hover:text-iron">
          ← Inbox
        </Link>
      </nav>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-iron/70">
          Notifications
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Notification preferences
        </h1>
        <p className="mt-3 text-iron/70">
          Choose what we ping you about. Channel availability:
          <span className="ml-2 inline-flex flex-wrap gap-2">
            <ChannelChip label="Push" available={hasPush} />
            <ChannelChip label="SMS" available={hasSms} />
            <ChannelChip label="Email" available={hasEmail} />
          </span>
        </p>
      </header>

      <PreferencesForm
        initial={prefs}
        hadRow={!!stored}
        smsAllowed={smsAllowed}
        smsCopy={smsCopy}
      />

      <div className="mt-6">
        <BrandMutes brands={followedBrands} setBrandMuted={setBrandMuted} />
      </div>

      <p className="mt-8 text-xs text-iron/70">
        We never sell your data. You can unsubscribe from emails at any
        time via the link at the bottom of any email.
      </p>
    </main>
  );
}

function ChannelChip({
  label,
  available,
}: {
  label: string;
  available: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs " +
        (available
          ? "border-emerald-400/30 text-sage-ink"
          : "border-iron/10 text-iron/70")
      }
      title={available ? `${label} is set up` : `${label} is not set up`}
    >
      {label} · {available ? "on" : "off"}
    </span>
  );
}
