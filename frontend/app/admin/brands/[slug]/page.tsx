import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessBrand, getAdminContext } from "@/lib/admin";
import { listEventsForAdmin } from "@/lib/data/brands";
import { listRsvpsForEvent } from "@/lib/data/events";
import BrandEditForm from "./edit-form";
import CreateEventForm from "./create-event-form";
import EditableEventRow from "./editable-event-row";
import CheckinQr from "./checkin-qr";
import {
  ROTATION_SECONDS,
  checkinPath,
  checkinRotationEnabled,
  checkinSecretFromEnv,
  checkinTokenExpiresAt,
  signCheckinToken,
} from "@/lib/checkin-token";
import { canRsvpNow, FOUNDER_EARLY_RSVP_HOURS } from "@/lib/founder-perks";
import {
  deleteEventAction,
  sendReminderNowAction,
  updateBrandLocationAction,
} from "../actions";
import { BRAND_CATEGORIES, BRAND_CATEGORY_LABELS, isBrandCategory } from "@/lib/brands";

type ReminderRow = {
  event_id: string;
  kind: string;
  sent_at: string;
  recipients_sms: number;
  recipients_email: number;
  error: string | null;
};

export const dynamic = "force-dynamic";

export default async function AdminBrandEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const locationSaved = query.location === "saved";
  const locationError =
    typeof query.location_error === "string" ? query.location_error : null;
  const ctx = await getAdminContext();
  if (!canAccessBrand(ctx, slug)) notFound();
  const admin = createAdminClient();
  const brandColumns =
    "slug, name, tagline, bio, hero_image, hero_focal_x, hero_focal_y, accent_from, accent_to, genres, social, active, sort_order";
  const withHours = await admin
    .from("brands")
    .select(`${brandColumns}, founder_early_rsvp_hours`)
    .eq("slug", slug)
    .maybeSingle();
  const brandResult = withHours.error
    ? await admin.from("brands").select(brandColumns).eq("slug", slug).maybeSingle()
    : withHours;
  const brand = brandResult.data;
  const earlyHours = withHours.error
    ? FOUNDER_EARLY_RSVP_HOURS
    : ((withHours.data?.founder_early_rsvp_hours as number | null) ?? FOUNDER_EARLY_RSVP_HOURS);

  if (!brand) notFound();

  // Discovery / location fields (0024, seeded 0087). Queried separately so
  // the page still renders if the columns are missing in an environment.
  const { data: locationRow } = await admin
    .from("brands")
    .select("category, city, address, cuisine, lat, lng")
    .eq("slug", slug)
    .maybeSingle();
  const location = {
    category:
      typeof locationRow?.category === "string" && isBrandCategory(locationRow.category)
        ? locationRow.category
        : "restaurant",
    city: (locationRow?.city as string | null) ?? "",
    address: (locationRow?.address as string | null) ?? "",
    cuisine: (locationRow?.cuisine as string | null) ?? "",
    lat: locationRow?.lat == null ? "" : String(locationRow.lat),
    lng: locationRow?.lng == null ? "" : String(locationRow.lng),
  };

  const events = await listEventsForAdmin(slug);

  const rsvpListsByEvent = await Promise.all(
    events.map((e) => listRsvpsForEvent(e.id)),
  );

  // Recent reminders for every event on this brand (for status chips)
  const eventIds = events.map((e) => e.id);
  const remindersByEvent = new Map<string, ReminderRow[]>();
  if (eventIds.length > 0) {
    const { data: reminders } = await admin
      .from("event_reminders")
      .select("event_id, kind, sent_at, recipients_sms, recipients_email, error")
      .in("event_id", eventIds)
      .order("sent_at", { ascending: false });
    for (const r of (reminders ?? []) as ReminderRow[]) {
      const arr = remindersByEvent.get(r.event_id) ?? [];
      arr.push(r);
      remindersByEvent.set(r.event_id, arr);
    }
  }

  const social = (brand.social ?? []) as Array<{ label: string; href: string }>;
  const socialText = social.map((s) => `${s.label}|${s.href}`).join("\n");
  const genresText = (brand.genres ?? []).join(", ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/brands" className="text-xs text-iron/70 hover:text-iron">
            ← Back to brands
          </Link>
          <h1 className="mt-2 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Edit {brand.name as string}
          </h1>
          <p className="mt-1 text-xs text-iron/70">/{brand.slug as string}</p>
        </div>
        <Link
          href={`/brands/${brand.slug as string}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-iron/20 px-4 py-2 text-xs text-iron/80 hover:bg-iron/10"
        >
          View public page ↗
        </Link>
      </div>

      <BrandEditForm
        slug={brand.slug as string}
        initial={{
          name: (brand.name as string) ?? "",
          tagline: (brand.tagline as string | null) ?? "",
          bio: (brand.bio as string | null) ?? "",
          heroImage: (brand.hero_image as string | null) ?? null,
          heroFocalX: (brand.hero_focal_x as number | null) ?? 50,
          heroFocalY: (brand.hero_focal_y as number | null) ?? 50,
          accentFrom: (brand.accent_from as string) ?? "#D4A017",
          accentTo: (brand.accent_to as string) ?? "#9B2335",
          genresText,
          socialText,
          active: (brand.active as boolean) ?? true,
          sortOrder: (brand.sort_order as number) ?? 99,
          founderEarlyRsvpHours: earlyHours,
        }}
      />

      {/* Location & category — discovery fields (0024 / 0087). Plain server
          form; the action redirects back with ?location=saved|location_error. */}
      <section id="location" className="glass-card p-5 scroll-mt-24">
        <p className="text-sm font-semibold">Location &amp; category</p>
        <p className="mt-1 text-xs text-iron/70">
          Powers the brand directory filters, &ldquo;near me&rdquo; sorting and the
          &ldquo;{"{Category} · {City}"}&rdquo; line on the public page. Coordinates are
          optional; leave both blank to skip proximity sorting.
        </p>
        <form action={updateBrandLocationAction} className="mt-3 space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="grid gap-3 md:grid-cols-3">
            <AdminField label="Category">
              <select
                name="category"
                defaultValue={location.category}
                className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
              >
                {BRAND_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {BRAND_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="City">
              <input
                name="city"
                defaultValue={location.city}
                placeholder="Belmont, NC"
                maxLength={120}
                className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
              />
            </AdminField>
            <AdminField label="Cuisine / subcategory">
              <input
                name="cuisine"
                defaultValue={location.cuisine}
                placeholder="southern, coffee, lifestyle…"
                maxLength={60}
                className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
              />
            </AdminField>
          </div>
          <AdminField label="Street address">
            <input
              name="address"
              defaultValue={location.address}
              placeholder="Street, city, state ZIP — shown in the Visit block"
              maxLength={240}
              className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
            />
          </AdminField>
          <div className="grid gap-3 md:grid-cols-2">
            <AdminField label="Latitude">
              <input
                name="lat"
                type="number"
                step="any"
                min={-90}
                max={90}
                defaultValue={location.lat}
                placeholder="35.2426"
                className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
              />
            </AdminField>
            <AdminField label="Longitude">
              <input
                name="lng"
                type="number"
                step="any"
                min={-180}
                max={180}
                defaultValue={location.lng}
                placeholder="-81.0380"
                className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
              />
            </AdminField>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            {locationSaved && <span className="text-xs text-sage-ink">✓ Saved</span>}
            {locationError && (
              <span className="text-xs text-ember" title={locationError}>
                ✗ {locationError}
              </span>
            )}
            <button
              type="submit"
              className="rounded-full bg-ember px-6 py-2 text-sm font-semibold text-linen"
            >
              Save location
            </button>
          </div>
        </form>
      </section>

      {/* Events CRUD */}
      <section className="glass-card p-5">
        <p className="text-sm font-semibold">Upcoming events</p>
        <p className="mt-1 text-xs text-iron/70">
          Shown on the brand page. Set <span className="text-iron/80">active = false</span> to hide without deleting,
          or click ✏️ Edit on a row to change date, location, capacity, or the founder RSVP window.
        </p>
        <div className="mt-3 space-y-3">
          {events.length === 0 && <p className="text-xs text-iron/70">No events yet.</p>}
          {events.map((e, i) => {
            const rsvps = rsvpListsByEvent[i] ?? [];
            const atCap = e.capacity != null && e.capacity > 0 && rsvps.length >= e.capacity;
            const reminders = remindersByEvent.get(e.id) ?? [];
            const rem24 = reminders.find((r) => r.kind === "reminder_24h");
            const rem1h = reminders.find((r) => r.kind === "reminder_1h");
            const remindersScheduled =
              e.starts_at !== null && e.active && new Date(e.starts_at) > new Date();
            return (
              <EditableEventRow
                key={e.id}
                brandSlug={slug}
                brandEarlyHours={earlyHours}
                event={{
                  id: e.id,
                  title: e.title,
                  detail: e.detail ?? null,
                  event_date: e.event_date ?? null,
                  starts_at: e.starts_at ?? null,
                  location: e.location ?? null,
                  url: e.url ?? null,
                  capacity: e.capacity ?? null,
                  sort_order: e.sort_order ?? 0,
                  active: e.active ?? true,
                  founder_early_rsvp_hours: e.founder_early_rsvp_hours ?? null,
                  rsvp_opens_at: e.rsvp_opens_at ?? null,
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {e.title}
                      {!e.active && (
                        <span className="ml-2 rounded-full bg-iron/10 px-2 py-0.5 text-xs uppercase text-iron/70">
                          Inactive
                        </span>
                      )}
                      {atCap && (
                        <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs uppercase text-ember">
                          Full
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-iron/70">
                      {e.detail ?? "—"} · {e.event_date ?? "—"}
                      {e.location ? ` · 📍 ${e.location}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-iron/70">
                      {rsvps.length}
                      {e.capacity ? ` / ${e.capacity}` : ""} RSVPed
                      {" · "}
                      {canRsvpNow({ isFounder: false, opensAt: e.rsvp_opens_at })
                        ? "RSVPs are open to everyone"
                        : `Founders only until ${new Date(e.rsvp_opens_at as string).toLocaleString()}`}
                    </p>
                    {/* Reminder status */}
                    {(rem24 || rem1h || remindersScheduled) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <ReminderChip label="24h" row={rem24} scheduled={remindersScheduled} />
                        <ReminderChip label="1h" row={rem1h} scheduled={remindersScheduled} />
                      </div>
                    )}
                    {e.url && <p className="mt-1 text-xs text-iron/70 truncate">{e.url}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <form action={sendReminderNowAction}>
                      <input type="hidden" name="event_id" value={e.id} />
                      <input type="hidden" name="brand_slug" value={slug} />
                      <button className="rounded-full bg-iron/10 px-2 py-0.5 text-xs text-iron/80 hover:bg-iron/20">
                        📣 Send reminder now
                      </button>
                    </form>
                    <form action={deleteEventAction}>
                      <input type="hidden" name="event_id" value={e.id} />
                      <input type="hidden" name="brand_slug" value={slug} />
                      <button className="text-xs text-ember/80 hover:text-ember">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                {rsvps.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-iron/70 hover:text-iron">
                      View RSVPs ({rsvps.length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rsvps.map((r) => (
                        <Link
                          key={r.member_id}
                          href={`/admin/members/${r.member_id}`}
                          className="inline-flex items-center gap-2 rounded-full bg-iron/5 px-2 py-1 text-xs hover:bg-iron/10"
                        >
                          {r.member?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.member.avatar_url as string}
                              alt=""
                              className="h-4 w-4 rounded-full object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-ember text-[8px] font-bold">
                              {(r.member?.first_name?.[0] ?? "F").toUpperCase()}
                            </span>
                          )}
                          <span>{r.member?.first_name ?? "Anonymous"}</span>
                        </Link>
                      ))}
                    </div>
                  </details>
                )}
              </EditableEventRow>
            );
          })}
        </div>

        <CreateEventForm slug={slug} brandEarlyHours={earlyHours} />
      </section>

      {/* Check-in QR — live, rotating code to display at the register / entrance */}
      <CheckinQr
        brandSlug={brand.slug as string}
        brandName={brand.name as string}
        rotationSeconds={ROTATION_SECONDS}
        {...signedCheckinQr(brand.slug as string)}
      />
    </div>
  );
}

/**
 * First render of the check-in QR: the current signed path (when
 * CHECKIN_SIGNING_SECRET is set), when it stops being current, and whether
 * tokens rotate. The client component then keeps it fresh itself.
 */
function signedCheckinQr(brandSlug: string): {
  initialPath: string;
  initialExpiresAt: number | null;
  rotation: "on" | "off";
} {
  const secret = checkinSecretFromEnv();
  const rotation = checkinRotationEnabled() ? "on" : "off";
  const now = Date.now();
  const token = secret ? signCheckinToken(brandSlug, secret, now) : null;
  return {
    initialPath: checkinPath(brandSlug, token),
    initialExpiresAt: token && rotation === "on" ? checkinTokenExpiresAt(now) : null,
    rotation,
  };
}

function ReminderChip({
  label,
  row,
  scheduled,
}: {
  label: string;
  row: ReminderRow | undefined;
  scheduled: boolean;
}) {
  if (row) {
    if (row.error) {
      return (
        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-ember">
          {label}: failed · {row.error.slice(0, 40)}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-sage-ink">
        {label}: ✓ sent · {row.recipients_sms} sms · {row.recipients_email} email
      </span>
    );
  }
  if (!scheduled) return null;
  return (
    <span className="rounded-full bg-iron/10 px-2 py-0.5 text-xs text-iron/70">
      {label}: scheduled
    </span>
  );
}

function AdminField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-iron/70">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
