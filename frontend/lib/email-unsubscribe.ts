import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Turn off marketing email for the member who owns this token.
 * Idempotent: already opted out still counts as success.
 * The token is the secret. Callers must not log it.
 */
export async function unsubscribeEmailByToken(
  token: string,
): Promise<"ok" | "not_found" | "error"> {
  const clean = token.trim();
  if (!clean || clean.length > 200) return "not_found";

  try {
    const admin = createAdminClient();
    const { data: member, error: findError } = await admin
      .from("members")
      .select("id")
      .eq("unsubscribe_token", clean)
      .maybeSingle();
    if (findError) return "error";
    if (!member) return "not_found";

    const { error: updateError } = await admin
      .from("members")
      .update({ email_opted_in: false })
      .eq("id", member.id);
    if (updateError) return "error";
    return "ok";
  } catch (err) {
    console.error("[unsubscribe] failed", err instanceof Error ? err.message : "error");
    return "error";
  }
}
