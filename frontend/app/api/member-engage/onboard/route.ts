import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stampOnboardedCookie } from "@/lib/auth-cookies";
import { getFirstSessionFacts } from "@/lib/data/first-session";
import { emitNetworkEvent } from "@/lib/network";
import { claimFreeFoundingOnJoin } from "@/lib/founding";
import {
  buildMemberProfileUpdates,
  isOnboardDraft,
  isOnboardingComplete,
  resolveOnboardingMember,
  wizardFormFromMember,
  type OnboardProfilePayload,
  type OnboardingMemberRow,
} from "@/lib/onboard-profile";

export const runtime = "nodejs";

type OnboardPayload = OnboardProfilePayload;

/**
 * Hard-reload recovery for the wizard. Finished profiles (first_name +
 * consent) return complete so the client can replace("/") instead of
 * remounting a blank 33% Step 1.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const loadMember = async (
      client: ReturnType<typeof createAdminClient> | typeof supabase,
    ) =>
      resolveOnboardingMember(async (columns) => {
        const { data, error } = await client
          .from("members")
          .select(columns)
          .eq("id", user.id)
          .maybeSingle();
        return { data: (data as OnboardingMemberRow | null) ?? null, error };
      });

    let member: OnboardingMemberRow | null = null;
    try {
      member = await loadMember(createAdminClient());
    } catch {
      member = null;
    }
    if (!member) {
      try {
        member = await loadMember(supabase);
      } catch {
        member = null;
      }
    }

    const complete = isOnboardingComplete(member);
    const form = wizardFormFromMember(member, user.email);
    const facts = await getFirstSessionFacts();
    const response = NextResponse.json({
      complete,
      member,
      form,
      facts,
    });
    if (complete) stampOnboardedCookie(response);
    return response;
  } catch (err) {
    console.error("onboard GET error:", err);
    return NextResponse.json(
      { error: "Unable to load onboarding." },
      { status: 500 },
    );
  }
}

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
    const draft = isOnboardDraft(payload);

    // 1. Persist profile fields via service role.
    //
    // User-JWT UPDATE + `.single()` is a silent fail mode: 0 rows (no
    // member row yet) or the 0051 integrity trigger / column grants can
    // 500 the wizard while the UI looks inert. Admin write is the same
    // path birthday_month already used.
    //
    // Handle goes into socials jsonb — not members.handle (legacy).
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("members")
      .select("id, socials")
      .eq("id", user.id)
      .maybeSingle();

    const updates = buildMemberProfileUpdates(
      payload,
      (existing?.socials as Record<string, unknown> | null) ?? null,
    );

    let member: {
      id: string;
      first_name: string | null;
      interest: string | null;
      favorite_brand: string | null;
      current_tier: string | null;
      total_points: number | null;
      profile_slug: string | null;
    } | null = null;

    const memberSelect =
      "id, first_name, interest, favorite_brand, current_tier, total_points, profile_slug";

    if (Object.keys(updates).length > 0) {
      const writer = existing
        ? admin.from("members").update(updates).eq("id", user.id)
        : admin.from("members").insert({
            id: user.id,
            email: user.email ?? null,
            ...updates,
          });
      const { data, error: updateErr } = await writer
        .select(memberSelect)
        .single();

      if (updateErr) {
        console.error("onboard: failed to save member", updateErr);
        return NextResponse.json(
          { error: "Unable to save profile." },
          { status: 500 },
        );
      }
      member = data;
    } else if (existing) {
      const { data } = await admin
        .from("members")
        .select(memberSelect)
        .eq("id", user.id)
        .maybeSingle();
      member = data;
    }

    const { data: saved } = await admin
      .from("members")
      .select(memberSelect)
      .eq("id", user.id)
      .maybeSingle();
    if (saved) member = saved;

    const expectedName =
      typeof payload.firstName === "string" ? payload.firstName.trim() : "";
    const expectedInterest =
      typeof payload.interest === "string" ? payload.interest.trim() : "";
    if (expectedName && member?.first_name !== expectedName) {
      console.error("onboard: first_name did not persist", {
        expectedName,
        saved: member?.first_name,
      });
      return NextResponse.json(
        { error: "Unable to save profile name." },
        { status: 500 },
      );
    }
    if (expectedInterest && member?.interest !== expectedInterest) {
      console.error("onboard: interest did not persist", {
        expectedInterest,
        saved: member?.interest,
      });
      return NextResponse.json(
        { error: "Unable to save interests." },
        { status: 500 },
      );
    }

    if (draft) {
      return NextResponse.json({
        success: true,
        draft: true,
        member: {
          id: member?.id,
          first_name: member?.first_name,
          interest: member?.interest,
          favorite_brand: member?.favorite_brand,
          current_tier: member?.current_tier,
          total_points: member?.total_points,
          profile_slug: member?.profile_slug,
        },
      });
    }

    const birthdayMonth = parseBirthdayMonth(payload.birthdayMonth);
    if (birthdayMonth !== undefined) {
      try {
        const admin = createAdminClient();
        await admin
          .from("members")
          .update({ birthday_month: birthdayMonth })
          .eq("id", user.id);
      } catch (err) {
        console.warn("onboard: birthday_month save failed", err);
      }
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

    // 3b. Nellie's membership + Jackie welcome dessert (join grant, not a 1-pt SKU).
    try {
      const admin = createAdminClient();
      await admin.from("member_community_memberships").upsert(
        {
          member_id: user.id,
          community_id: "nellies",
          status: "active",
        },
        { onConflict: "member_id,community_id" },
      );
      await claimFreeFoundingOnJoin(user.id, "nellies");
      const favorite = typeof payload.favoriteBrand === "string"
        ? payload.favoriteBrand.trim().toLowerCase()
        : "";
      if (favorite && favorite !== "nellies" && /^[a-z0-9-]{1,64}$/.test(favorite)) {
        await admin.from("member_community_memberships").upsert(
          {
            member_id: user.id,
            community_id: favorite,
            status: "active",
          },
          { onConflict: "member_id,community_id" },
        );
        await claimFreeFoundingOnJoin(user.id, favorite);
      }
      const { error: perkErr } = await admin.rpc("grant_nellies_welcome_dessert", {
        p_member_id: user.id,
      });
      if (perkErr) {
        await admin.from("member_perks").upsert(
          {
            member_id: user.id,
            community_id: "nellies",
            perk_slug: "nsk-welcome-dessert",
            source_ref: `nellies:welcome-dessert:${user.id}`,
          },
          { onConflict: "source_ref" },
        );
      }
    } catch (err) {
      console.warn("onboard: Nellie's welcome dessert grant failed", err);
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

    const response = NextResponse.json({
      success: true,
      member: {
        id: member?.id,
        first_name: member?.first_name,
        interest: member?.interest,
        favorite_brand: member?.favorite_brand,
        current_tier: member?.current_tier,
        total_points: member?.total_points,
        profile_slug: member?.profile_slug,
      },
    });
    stampOnboardedCookie(response);
    return response;
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

function parseBirthdayMonth(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < 1 || n > 12) return undefined;
  return n;
}
