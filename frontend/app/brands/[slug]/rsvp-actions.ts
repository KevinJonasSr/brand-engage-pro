"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleRsvpAction(formData: FormData) {
  const eventId = String(formData.get("event_id") ?? "").trim();
  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const wantRsvp = String(formData.get("rsvp") ?? "true") === "true";
  if (!eventId || !brandSlug) return { ok: false as const, error: "Missing event" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  if (wantRsvp) {
    const { error } = await supabase
      .from("event_rsvps")
      .insert({ event_id: eventId, member_id: user.id });
    if (error) {
      revalidatePath(`/brands/${brandSlug}`);
      return {
        ok: false as const,
        error: error.message.includes("capacity")
          ? "Event is at capacity"
          : "Couldn't RSVP (try again in a moment)",
      };
    }
  } else {
    await supabase
      .from("event_rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("member_id", user.id);
  }

  revalidatePath(`/brands/${brandSlug}`);
  return { ok: true as const };
}
