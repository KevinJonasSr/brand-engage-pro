"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  BIRTHDAY_MONTH_LOCKED_ERROR,
  planBirthdayMonthSave,
  type BirthdayMonthSaveResult,
} from "@/lib/birthday-month";

const SAVE_FAILED = "We couldn't save your birthday month. Please try again.";

/**
 * Set the signed-in member's birthday month once, for members who finished
 * onboarding without it. Runs as the member (0058 grants authenticated
 * update on birthday_month). The update only matches while the column is
 * still null, so two tabs racing cannot overwrite a saved month.
 */
export async function saveBirthdayMonthAction(
  formData: FormData,
): Promise<BirthdayMonthSaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };

  const { data: member, error: readError } = await supabase
    .from("members")
    .select("birthday_month")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("saveBirthdayMonthAction: read failed", readError);
    return { ok: false, error: SAVE_FAILED };
  }

  const plan = planBirthdayMonthSave(
    member?.birthday_month as number | null | undefined,
    formData.get("birthday_month"),
  );
  if (!plan.ok) return plan;

  const { data: updated, error } = await supabase
    .from("members")
    .update({ birthday_month: plan.month })
    .eq("id", user.id)
    .is("birthday_month", null)
    .select("id");
  if (error) {
    console.error("saveBirthdayMonthAction: update failed", error);
    return { ok: false, error: SAVE_FAILED };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: BIRTHDAY_MONTH_LOCKED_ERROR };
  }

  revalidatePath("/me/birthday");
  revalidatePath("/me");
  return plan;
}
