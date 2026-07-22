import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNetworkEvent } from "@/lib/network";

export const runtime = "nodejs";

type OnboardPayload = {
  firstName?: string;
  lastName?: string;
  city?: string;
  phone?: string;
  handle?: string;
  favoriteBrand?: string;
  interest?: string;
  referralCode?: string; // optional — the ref code that was passed in the invite link
  smsOptedIn?: boolean;
  emailOptedIn?: boolean;
  consentAcceptedAt?: string;
  consentVersion?: string;
};

/**
 * Finalizes an onboarding submission for the currently-signed-in member.
 * Idempotent: re-submitting updates the member row and is a no-op for the
 * signup bonus if one has already been awarded.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const payload = (await request.json()) as OnboardPayload;

    // 1. Update the member's profile row (created by the auth trigger).
    //
    // The onboarding wizard's "TikTok or Instagram handle" field arrives
    // as payload.handle. We do NOT write that to members.handle (legacy)
    // — instead we merge it into the socials jsonb column so social
    // identifiers stay in their own field. The URL slug column,
    // members.profile_slug, is owned by the BEFORE INSERT trigger.
    let socialsMerge: Record<string, unknown> | undefined = undefined;
    if (typeof payload.handle === "string" && payload.handle.trim()) {
      const { data: existing } = await supabase
        .from("members")
        .select("socials")
        .eq("id", user.id)
        .maybeSingle();
      socialsMerge = {
        ...((existing?.socials as Record<string, unknown> | null) ?? {}),
        instagram_or_tiktok: payload.handle.trim(),
      };
    }

    const updates: Record<string, unknown> = {
      first_name: payload.firstName ?? null,
      last_name: payload.lastName ?? null,
      city: payload.city ?? null,
      phone: payload.phone ?? null,
      favorite_brand: payload.favoriteBrand ?? null,
      interest: payload.interest ?? null,
      sms_opted_in: Boolean(payload.smsOptedIn),
      email_opted_in: Boolean(payload.emailOptedIn),
      consent_accepted_at: payload.consentAcceptedAt ?? new Date().toISOString(),
      consent_version: payload.consentVersion ?? null,
    };
    if (socialsMerge !== undefined) updates.socials = socialsMerge;

    const { data: member, error: updateErr } = await supabase
      .from("members")
      .update(updates)
      .eq("id", user.id)
      .select("id, first_name, current_tier, total_points, profile_slug")
      .single();

    if (updateErr) {
      console.error("onboard: failed to update member", updateErr);
      return NextResponse.json(
        { error: "Unable to save profile." },
        { status: 500 },
      );
    }

    // 2. Handle referral code — service-role so we can look up the referrer.
    if (payload.referralCode) {
      try {
        const admin = createAdminClient();
        const { data: referrer } = await admin
          .from("members")
          .select("id")
          .eq("referral_code", payload.referralCode)
          .maybeSingle();

        if (referrer && referrer.id !== user.id) {
          await admin.from("referrals").upsert(
            {
              referrer_id: referrer.id,
              referred_id: user.id,
              referred_email: user.email ?? null,
              status: "verified",
              points_awarded: 150,
              verified_at: new Date().toISOString(),
            },
            { onConflict: "referred_id" },
          );
          await admin.from("points_ledger").insert({
            member_id: referrer.id,
            delta: 150,
            source: "referral",
            source_ref: user.id,
            note: `Referred by ${user.email}`,
          });
          await admin
            .from("members")
            .update({
              total_points: ((await getTotal(admin, referrer.id)) ?? 0) + 150,
            })
            .eq("id", referrer.id);
          await admin
            .from("members")
            .update({ referred_by: referrer.id })
            .eq("id", user.id);

          // Jonas Network: the referrer converted a new member. One event
          // per referred member (upsert above is keyed the same way).
          emitNetworkEvent({
            event_type: "referral.converted",
            local_actor_id: referrer.id,
            entity_type: "member",
            entity_id: user.id,
            dedupe_key: `be:referral:${referrer.id}:${user.id}`,
            metadata: {
              referred_member_id: user.id,
              referral_code: payload.referralCode,
              points_awarded: 150,
            },
          });
        }
      } catch (err) {
        console.warn("onboard: referral handling failed", err);
        // don't block the onboarding response on referral failure
      }
    }

    // 3. Award signup bonus — idempotent via source_ref = `signup:${userId}`.
    try {
      const admin = createAdminClient();
      const sourceRef = `signup:${user.id}`;
      const { data: existing } = await admin
        .from("points_ledger")
        .select("id")
        .eq("source", "signup_bonus")
        .eq("source_ref", sourceRef)
        .maybeSingle();

      if (!existing) {
        await admin.from("points_ledger").insert({
          member_id: user.id,
          delta: 100,
          source: "signup_bonus",
          source_ref: sourceRef,
          note: "Welcome to Brand Engage Pro",
        });
        const newTotal = ((await getTotal(admin, user.id)) ?? 0) + 100;
        await admin
          .from("members")
          .update({ total_points: newTotal })
          .eq("id", user.id);
      }
    } catch (err) {
      console.warn("onboard: signup bonus failed", err);
      // non-fatal — profile save still succeeded
    }

    // 4. Founding-member badge — auto-awarded to anyone who completes
    //    onboarding before the founding window closes (2026-07-15).
    //    award_badge() handles dedupe + in-app notification; the wider
    //    try/catch ensures onboarding still succeeds even if the badge
    //    insert errors.
    const FOUNDING_CUTOFF = new Date("2026-07-16T00:00:00Z");
    if (new Date() < FOUNDING_CUTOFF) {
      try {
        const admin = createAdminClient();
        const { error: badgeErr } = await admin.rpc("award_badge", {
          p_member_id: user.id,
          p_slug: "founder-member",
        });
        if (badgeErr) {
          console.warn("onboard: founder-member award_badge rpc failed", badgeErr);
        }
      } catch (err) {
        console.warn("onboard: founder-member badge award failed", err);
      }
    }

    return NextResponse.json({ success: true, member: { id: member?.id, first_name: member?.first_name, current_tier: member?.current_tier, total_points: member?.total_points, profile_slug: member?.profile_slug } });
  } catch (err) {
    console.error("onboard route error:", err);
    return NextResponse.json(
      { error: "Unable to complete onboarding." },
      { status: 500 },
    );
  }
}

async function getTotal(
  admin: ReturnType<typeof createAdminClient>,
  memberId: string,
): Promise<number | null> {
  const { data } = await admin
    .from("members")
    .select("total_points")
    .eq("id", memberId)
    .maybeSingle();
  return (data?.total_points as number | null) ?? 0;
}
