"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";
import { sendEventReminder, type ReminderWindowEvent } from "@/lib/reminders";

async function requireAdmin() {
  const admin = await getAdminUser();
  if (!admin) throw new Error("Forbidden");
  return admin;
}

/**
 * Create a new brand. Returns { success, slug } on success or { error } on
 * validation/DB failure. The client form (CreateBrandForm) handles the
 * post-success navigation via router.push so retry-on-503 + visible status
 * can work without the redirect throwing NEXT_REDIRECT mid-retry.
 */
export async function createBrandAction(formData: FormData) {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-");
  const name = String(formData.get("name") ?? "").trim();
  if (!slug || !name) {
    return { error: "Slug and display name are required." };
  }
  const supa = createAdminClient();
  const { error } = await supa
    .from("brands")
    .insert({ slug, name, sort_order: 99 });
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/admin/brands");
  return { success: true as const, slug };
}

export async function updateBrandAction(formData: FormData) {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const heroImage = String(formData.get("hero_image") ?? "").trim();
  const accentFrom = String(formData.get("accent_from") ?? "#7c3aed").trim();
  const accentTo = String(formData.get("accent_to") ?? "#f97316").trim();
  const genresRaw = String(formData.get("genres") ?? "").trim();
  const socialRaw = String(formData.get("social") ?? "").trim();
  const active = String(formData.get("active") ?? "true") === "true";
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "99"), 10);
  const genres = genresRaw
    ? genresRaw
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];
  // Social is two parallel text areas in the form: one per "label|href" line.
  const social = socialRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split("|");
      return { label: (label ?? "").trim(), href: rest.join("|").trim() };
    })
    .filter((s) => s.label && s.href);
  const supa = createAdminClient();
  await supa
    .from("brands")
    .update({
      name,
      tagline: tagline || null,
      bio: bio || null,
      hero_image: heroImage || null,
      accent_from: accentFrom,
      accent_to: accentTo,
      genres,
      social,
      active,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 99,
    })
    .eq("slug", slug);
  revalidatePath("/admin/brands");
  revalidatePath(`/admin/brands/${slug}`);
  revalidatePath(`/brands/${slug}`);
  revalidatePath(`/brands`);
}

/**
 * Create a new event for an brand. Returns { success } on success or
 * { error } on validation/DB failure. The client form (CreateEventForm)
 * uses useFormSave for retry-on-503 + visible status feedback.
 */
export async function createEventAction(formData: FormData) {
  await requireAdmin();
  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!brandSlug || !title) {
    return { error: "Title is required." };
  }
  const detail = String(formData.get("detail") ?? "").trim();
  const eventDate = String(formData.get("event_date") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;

  const supa = createAdminClient();
  const { error } = await supa.from("brand_events").insert({
    brand_slug: brandSlug,
    title,
    detail: detail || null,
    event_date: eventDate || null,
    starts_at: startsAt || null,
    location: location || null,
    url: url || null,
    capacity: Number.isFinite(capacity) ? capacity : null,
    sort_order: sortOrder,
  });
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/admin/brands/${brandSlug}`);
  revalidatePath(`/brands/${brandSlug}`);
  return { success: true as const };
}

/**
 * Update an existing event. Mirrors createEventAction's field shape so the
 * EditEventForm can reuse the same form layout. Includes the `active` flag
 * (so admins can hide an event without deleting) and `sort_order` (so the
 * row order on the public brand page can be tuned). Returns { success } or
 * { error } so the client EditEventForm can use useFormSave for
 * retry-on-503 + visible status feedback.
 *
 * Notes
 *  • `active` arrives as the literal string "true" when the checkbox is
 *    checked, or is absent from the FormData when unchecked. We treat
 *    "true" as true and everything else (including missing) as false.
 *  • `tier` is intentionally NOT exposed in the form — events still
 *    default to 'public' on insert, and the existing seeded data is all
 *    public-tier. Add tier control here if/when the admin UI grows a
 *    "premium" toggle.
 */
export async function updateEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  if (!eventId || !brandSlug) {
    return { error: "Missing event_id or brand_slug." };
  }
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "Title is required." };
  }
  const detail = String(formData.get("detail") ?? "").trim();
  const eventDate = String(formData.get("event_date") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;
  const sortOrder = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;
  // Checkbox: present + "true" means active. Missing means unchecked.
  const active = String(formData.get("active") ?? "") === "true";

  const supa = createAdminClient();
  const { error } = await supa
    .from("brand_events")
    .update({
      title,
      detail: detail || null,
      event_date: eventDate || null,
      starts_at: startsAt || null,
      location: location || null,
      url: url || null,
      capacity: Number.isFinite(capacity) ? capacity : null,
      sort_order: sortOrder,
      active,
    })
    .eq("id", eventId)
    .eq("brand_slug", brandSlug);

  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/admin/brands/${brandSlug}`);
  revalidatePath(`/brands/${brandSlug}`);
  return { success: true as const };
}

export async function sendReminderNowAction(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  if (!eventId || !brandSlug) return;
  const supa = createAdminClient();
  const [{ data: event }, { data: brand }] = await Promise.all([
    supa
      .from("brand_events")
      .select("id, brand_slug, title, detail, starts_at, location, url, reminder_sms_template")
      .eq("id", eventId)
      .maybeSingle(),
    supa.from("brands").select("name").eq("slug", brandSlug).maybeSingle(),
  ]);
  if (!event) return;
  const reminderEvent: ReminderWindowEvent = {
    id: event.id as string,
    brand_slug: event.brand_slug as string,
    title: event.title as string,
    detail: (event.detail as string | null) ?? null,
    starts_at: (event.starts_at as string) ?? new Date().toISOString(),
    location: (event.location as string | null) ?? null,
    url: (event.url as string | null) ?? null,
    reminder_sms_template: (event.reminder_sms_template as string | null) ?? null,
    brand_name: (brand?.name as string | null) ?? null,
  };
  await sendEventReminder(reminderEvent, "manual");
  revalidatePath(`/admin/brands/${brandSlug}`);
}

export async function deleteEventAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("event_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  if (!id) return;
  const supa = createAdminClient();
  await supa.from("brand_events").delete().eq("id", id);
  revalidatePath(`/admin/brands/${brandSlug}`);
  revalidatePath(`/brands/${brandSlug}`);
}
