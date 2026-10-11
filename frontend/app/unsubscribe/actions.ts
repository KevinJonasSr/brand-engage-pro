"use server";

import { redirect } from "next/navigation";
import { unsubscribeEmailByToken } from "@/lib/email-unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Turn off email or text for the member who owns this token. Runs only on a
 * form POST, so mail link scanners that open every link cannot unsubscribe
 * anyone by visiting the page.
 */
export async function confirmUnsubscribe(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const ch = formData.get("channel") === "sms" ? "sms" : "email";
  if (!token) redirect("/unsubscribe");

  let status: "done" | "not_found" | "error" = "done";
  try {
    const admin = createAdminClient();
    const { data: member, error: findError } = await admin
      .from("members")
      .select("id")
      .eq("unsubscribe_token", token)
      .maybeSingle();
    if (findError) throw findError;
    if (!member) {
      status = "not_found";
    } else if (ch === "email") {
      const result = await unsubscribeEmailByToken(token);
      if (result === "not_found") status = "not_found";
      else if (result === "error") status = "error";
    } else {
      const { error: updateError } = await admin
        .from("members")
        .update({ sms_opted_in: false })
        .eq("id", member.id);
      if (updateError) throw updateError;
      // Keep the notification settings in step so texts stop everywhere.
      const { error: prefsError } = await admin
        .from("notification_preferences")
        .upsert({ member_id: member.id, sms_enabled: false }, { onConflict: "member_id" });
      if (prefsError) throw prefsError;
    }
  } catch (err) {
    console.error(
      "[unsubscribe] failed",
      err instanceof Error ? err.message : "error",
    );
    status = "error";
  }

  const params = new URLSearchParams({ token, channel: ch, status });
  redirect(`/unsubscribe?${params.toString()}`);
}
