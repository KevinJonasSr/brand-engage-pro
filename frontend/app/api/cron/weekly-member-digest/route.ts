import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  appBaseUrl,
  countMandrillResults,
  fromAddress,
  listUnsubscribeHeaders,
  mailingAddress,
  marketingEmailBlockReason,
  oneClickUnsubscribeUrl,
  parseEmailAllowlist,
  replyToAddress,
  unsubscribeUrl,
} from "@/lib/email-campaign";
import { gatherWeeklyRecap } from "@/lib/personal-recap/gather";
import {
  buildDigestContent,
  digestHasWeeklyActions,
  parseTestEmailParam,
} from "@/lib/member-digest";
import { createNotification } from "@/lib/data/notifications";
import { sumLedgerDeltas } from "@/lib/data/member-points";
import { BRAND_PREFS_TABLE } from "@/lib/notifications/brand-prefs";
import {
  LAPSED_NUDGE_KIND,
  groupFollows,
  lapsedActivityCutoffIso,
  lapsedDedupKey,
  lapsedResendCutoffIso,
  latestActivityByMember,
  nearestReward,
  recentlyNudgedIds,
  selectLapsedMembers,
  type ActivitySignal,
  type LapsedCandidate,
  type RewardLike,
} from "@/lib/digest/lapsed";
import { buildLapsedEmail, type LapsedBrand, type LapsedEmailContent } from "@/lib/digest/lapsed-email";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

/**
 * GET /api/cron/weekly-member-digest
 *
 * Weekly cron (Sundays 23:00 UTC). For every email-opted-in member who did
 * something in the past 7 days, sends a summary through Mailchimp
 * Transactional (Mandrill).
 *
 * Sends only when EMAIL_SENDING_ENABLED=1, BEP_MAILING_ADDRESS is set, and
 * MAILCHIMP_TRANSACTIONAL_API_KEY is set. The key alone does not send.
 * A stored visit streak is not enough: it stays frozen until the next visit.
 *
 * Safe test: set BEP_EMAIL_ALLOWLIST to an internal member address, then
 * GET this route with ?testEmail=that-address. Scheduled sends also stay
 * inside the allowlist until it is removed.
 *
 * After the active-member pass, a "we miss you" pass (lib/digest/lapsed.ts)
 * nudges members whose newest activity is 14–30 days old, who follow a brand
 * and who have not had a nudge in 30 days. Each send is recorded as a
 * notifications row (kind "lapsed_nudge") so the next run skips them.
 *
 * ?dryRun=1 (still cron-authed) sends nothing and records nothing: it skips
 * the active digest, runs the lapsed selection and returns the counts plus
 * the first rendered email. It works even while sending is switched off.
 */
export async function GET(req: Request) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const params = new URL(req.url).searchParams;
  const dryRun = params.get("dryRun") === "1";
  const testEmail = parseTestEmailParam(params.get("testEmail"));
  if (testEmail === "invalid") {
    return NextResponse.json(
      { ok: false, error: "testEmail must be one email address. Nothing was sent." },
      { status: 400 },
    );
  }

  const allow = parseEmailAllowlist();
  if (testEmail) {
    if (!allow.ok) {
      return NextResponse.json({ ok: false, error: allow.reason }, { status: 400 });
    }
    const listed = allow.emails?.has(testEmail);
    if (!listed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A test send requires BEP_EMAIL_ALLOWLIST to include that address. Nothing was sent.",
        },
        { status: 400 },
      );
    }
  }

  const blocked = marketingEmailBlockReason();
  if (blocked) {
    // A dry run renders without sending, so it may continue while blocked.
    if (!dryRun) {
      console.warn(`[weekly-digest] not sending: ${blocked}`);
      return NextResponse.json({
        ok: true,
        sent: 0,
        skipped: 0,
        failed: 0,
        blocked,
        testSend: Boolean(testEmail),
        ranAt: new Date().toISOString(),
      });
    }
    console.warn(`[weekly-digest] dry run while blocked: ${blocked}`);
  }

  const mandrillKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY?.trim() ?? "";
  const address = mailingAddress();
  const admin = createAdminClient();

  if (dryRun) {
    const lapsed = await runLapsedPass({
      admin,
      apiKey: mandrillKey,
      postalAddress: address ?? "(BEP_MAILING_ADDRESS not set)",
      allow: allow.ok ? allow.emails : null,
      testEmail,
      dryRun: true,
    });
    return NextResponse.json({
      ok: true,
      dryRun: true,
      blocked: blocked ?? null,
      digest: "skipped (dryRun)",
      lapsed,
      ranAt: new Date().toISOString(),
    });
  }

  if (!mandrillKey || !address) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      skipped: 0,
      failed: 0,
      blocked: "Email sending is not configured.",
      ranAt: new Date().toISOString(),
    });
  }

  let query = admin
    .from("members")
    .select("id, first_name, email, current_streak_days, unsubscribe_token, last_active_date")
    .eq("email_opted_in", true)
    .eq("suspended", false)
    .not("email", "is", null);
  if (testEmail) query = query.eq("email", testEmail);

  const { data: members, error } = await query;
  if (error) {
    console.error("[weekly-digest] Failed to fetch members:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of members ?? []) {
    const memberEmail = String(member.email ?? "");
    if (allow.ok && allow.emails && !allow.emails.has(memberEmail.trim().toLowerCase())) {
      skipped++;
      continue;
    }
    try {
      const recap = await gatherWeeklyRecap(member.id as string);
      if (!digestHasWeeklyActions(recap)) {
        skipped++;
        continue;
      }

      const token = (member.unsubscribe_token as string | null) ?? "";
      if (!token) {
        console.warn(`[weekly-digest] skipped member ${member.id}: no unsubscribe link`);
        skipped++;
        continue;
      }

      const ok = await sendDigestEmail({
        apiKey: mandrillKey,
        toEmail: memberEmail.trim(),
        firstName: (member.first_name as string | null) ?? "there",
        recap,
        streakDays: (member.current_streak_days as number | null) ?? 0,
        lastActiveDate: (member.last_active_date as string | null) ?? null,
        unsubscribeToken: token,
        postalAddress: address,
      });
      if (ok) sent++;
      else failed++;
    } catch (err) {
      console.error("[weekly-digest] Error processing member", member.id, err);
      failed++;
    }
  }

  // Second pass: members the digest above skipped because they went quiet.
  let lapsed: LapsedPassResult;
  try {
    lapsed = await runLapsedPass({
      admin,
      apiKey: mandrillKey,
      postalAddress: address,
      allow: allow.ok ? allow.emails : null,
      testEmail,
      dryRun: false,
    });
  } catch (err) {
    console.error("[weekly-digest] lapsed pass failed:", err);
    lapsed = {
      candidates: 0,
      sent: 0,
      skipped: 0,
      failed: 1,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json({
    ok: failed === 0 && lapsed.failed === 0,
    sent,
    skipped,
    failed,
    lapsed,
    testSend: Boolean(testEmail),
    ranAt: new Date().toISOString(),
  });
}

type Recap = Awaited<ReturnType<typeof gatherWeeklyRecap>>;

type LapsedPassResult = {
  /** Members in the 14–30 day window after every filter. */
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Dry runs only: the first rendered email. */
  preview?: { to: string; subject: string; text: string; html: string } | null;
  error?: string;
};

/**
 * "We miss you" pass. One query per signal table (not per member), one query
 * each for follows, mutes, opt-outs and prior nudges, then per-candidate reads
 * for the balance and the followed brands' rewards.
 */
async function runLapsedPass(params: {
  admin: ReturnType<typeof createAdminClient>;
  apiKey: string;
  postalAddress: string;
  allow: ReadonlySet<string> | null;
  testEmail: string | null;
  dryRun: boolean;
}): Promise<LapsedPassResult> {
  const { admin, apiKey, postalAddress, allow, testEmail, dryRun } = params;
  const now = new Date();
  const activityCutoff = lapsedActivityCutoffIso(now);
  const resendCutoff = lapsedResendCutoffIso(now);

  let memberQuery = admin
    .from("members")
    .select("id, first_name, email, unsubscribe_token, last_active_date")
    .eq("email_opted_in", true)
    .eq("suspended", false)
    .not("email", "is", null);
  if (testEmail) memberQuery = memberQuery.eq("email", testEmail);

  // Every activity signal in one query each, bounded to the window we care
  // about: anything newer than 31 days decides active vs lapsed; anything
  // older is "dormant" by absence.
  const [
    membersRes,
    ledgerRes,
    checkinsRes,
    reactionsRes,
    commentsRes,
    rsvpsRes,
    followsRes,
    nudgesRes,
    optOutRes,
  ] = await Promise.all([
    memberQuery,
    admin.from("points_ledger").select("member_id, created_at").gte("created_at", activityCutoff),
    admin.from("checkins").select("member_id, created_at").gte("created_at", activityCutoff),
    admin
      .from("community_reactions")
      .select("member_id, created_at")
      .gte("created_at", activityCutoff),
    admin
      .from("community_comments")
      .select("author_id, created_at")
      .gte("created_at", activityCutoff),
    // event_rsvps stamps rsvp_at, not created_at (migration 0007).
    admin.from("event_rsvps").select("member_id, rsvp_at").gte("rsvp_at", activityCutoff),
    admin.from("member_brand_following").select("member_id, brand_slug").order("followed_at"),
    admin
      .from("notifications")
      .select("member_id, created_at")
      .eq("kind", LAPSED_NUDGE_KIND)
      .gte("created_at", resendCutoff),
    admin
      .from("notification_preferences")
      .select("member_id")
      .eq("notify_weekly_digest", false),
  ]);

  if (membersRes.error) throw new Error(`members: ${membersRes.error.message}`);
  for (const [label, res] of [
    ["points_ledger", ledgerRes],
    ["checkins", checkinsRes],
    ["community_reactions", reactionsRes],
    ["community_comments", commentsRes],
    ["event_rsvps", rsvpsRes],
    ["member_brand_following", followsRes],
    ["notifications", nudgesRes],
    ["notification_preferences", optOutRes],
  ] as const) {
    if (res.error) throw new Error(`${label}: ${res.error.message}`);
  }

  type Row = Record<string, unknown>;
  const signal = (rows: Row[] | null, idCol: string, atCol = "created_at"): ActivitySignal[] =>
    (rows ?? []).map((r) => ({
      member_id: String(r[idCol] ?? ""),
      at: (r[atCol] as string | null) ?? null,
    }));

  const lastActivity = latestActivityByMember([
    ...signal(ledgerRes.data as Row[] | null, "member_id"),
    ...signal(checkinsRes.data as Row[] | null, "member_id"),
    ...signal(reactionsRes.data as Row[] | null, "member_id"),
    ...signal(commentsRes.data as Row[] | null, "author_id"),
    ...signal(rsvpsRes.data as Row[] | null, "member_id", "rsvp_at"),
  ]);

  const follows = groupFollows(
    ((followsRes.data ?? []) as Row[]).map((r) => ({
      member_id: String(r.member_id ?? ""),
      brand_slug: String(r.brand_slug ?? ""),
    })),
  );
  const recentlyNudged = recentlyNudgedIds(
    ((nudgesRes.data ?? []) as Row[]).map((r) => ({
      member_id: String(r.member_id ?? ""),
      created_at: (r.created_at as string | null) ?? null,
    })),
    now,
  );
  const digestOptOut = new Set(
    ((optOutRes.data ?? []) as Row[]).map((r) => String(r.member_id ?? "")),
  );

  const allCandidates = selectLapsedMembers({
    members: (membersRes.data ?? []) as Array<{
      id: string;
      email: string | null;
      first_name: string | null;
      unsubscribe_token: string | null;
      last_active_date: string | null;
    }>,
    lastActivity,
    followedSlugsByMember: follows,
    recentlyNudged,
    digestOptOut,
    now,
  });

  let skipped = 0;
  const candidates: LapsedCandidate[] = [];
  for (const c of allCandidates) {
    if (allow && !allow.has(c.email.trim().toLowerCase())) skipped++;
    else candidates.push(c);
  }

  if (candidates.length === 0) {
    return { candidates: 0, sent: 0, skipped, failed: 0, preview: dryRun ? null : undefined };
  }

  // Per-brand mutes decide which brands get named, never whether we send.
  const candidateIds = candidates.map((c) => c.id);
  const slugs = Array.from(new Set(candidates.flatMap((c) => c.followedSlugs)));
  const [mutesRes, brandsRes, rewardsRes] = await Promise.all([
    admin
      .from(BRAND_PREFS_TABLE)
      .select("member_id, brand_slug")
      .eq("muted", true)
      .in("member_id", candidateIds),
    admin.from("brands").select("slug, name").in("slug", slugs),
    admin
      .from("rewards_catalog")
      .select("id, title, point_cost, community_id")
      .eq("active", true)
      .in("community_id", slugs)
      .order("sort_order", { ascending: true }),
  ]);
  if (mutesRes.error) throw new Error(`${BRAND_PREFS_TABLE}: ${mutesRes.error.message}`);

  const mutedByMember = new Map<string, Set<string>>();
  for (const r of (mutesRes.data ?? []) as Row[]) {
    const id = String(r.member_id ?? "");
    const set = mutedByMember.get(id) ?? new Set<string>();
    set.add(String(r.brand_slug ?? ""));
    mutedByMember.set(id, set);
  }
  const brandName = new Map<string, string>();
  for (const b of (brandsRes.data ?? []) as Row[]) {
    brandName.set(String(b.slug ?? ""), String(b.name ?? b.slug ?? ""));
  }
  const rewardsBySlug = new Map<string, RewardLike[]>();
  for (const r of (rewardsRes.data ?? []) as Row[]) {
    const slug = String(r.community_id ?? "");
    const list = rewardsBySlug.get(slug) ?? [];
    list.push({
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      point_cost: Number(r.point_cost) || 0,
      community_id: slug,
    });
    rewardsBySlug.set(slug, list);
  }

  const base = appBaseUrl();
  let sent = 0;
  let failed = 0;
  let preview: LapsedPassResult["preview"] = null;

  for (const c of candidates) {
    try {
      const muted = mutedByMember.get(c.id);
      const visibleSlugs = c.followedSlugs.filter((s) => !muted?.has(s));
      // A member who muted every brand still gets the nudge; it just names none.
      const brands: LapsedBrand[] = visibleSlugs.slice(0, 2).map((slug) => ({
        slug,
        name: brandName.get(slug) ?? slug,
      }));

      const { data: ledger, error: ledgerErr } = await admin
        .from("points_ledger")
        .select("delta")
        .eq("member_id", c.id);
      if (ledgerErr) throw new Error(`points_ledger: ${ledgerErr.message}`);
      const balance = sumLedgerDeltas((ledger ?? []) as Array<{ delta?: number | null }>);

      const rewards = visibleSlugs.flatMap((slug) => rewardsBySlug.get(slug) ?? []);
      const nearest = nearestReward(rewards, balance);

      const content = buildLapsedEmail({
        firstName: c.firstName,
        brands,
        pointsBalance: balance,
        nearest,
        postalAddress,
        unsubscribeHref: unsubscribeUrl(base, c.unsubscribeToken),
        baseHref: base,
      });

      if (dryRun) {
        if (!preview) {
          preview = {
            to: c.email,
            subject: content.subject,
            text: content.text,
            html: content.html,
          };
        }
        continue;
      }

      const ok = await sendLapsedEmail({
        apiKey,
        toEmail: c.email,
        content,
        unsubscribeToken: c.unsubscribeToken,
        base,
      });
      if (!ok) {
        failed++;
        continue;
      }
      sent++;
      // Record the send so the next 30 days of runs skip this member.
      await createNotification({
        memberId: c.id,
        kind: LAPSED_NUDGE_KIND,
        title: "We miss you",
        body: `You still have ${balance.toLocaleString("en-US")} points waiting.`,
        url: content.ctaPath,
        icon: "👋",
        dedupKey: lapsedDedupKey(now),
      });
    } catch (err) {
      console.error("[weekly-digest] lapsed: error processing member", c.id, err);
      failed++;
    }
  }

  return {
    candidates: candidates.length,
    sent,
    skipped,
    failed,
    ...(dryRun ? { preview } : {}),
  };
}

async function sendLapsedEmail(params: {
  apiKey: string;
  toEmail: string;
  content: LapsedEmailContent;
  unsubscribeToken: string;
  base: string;
}): Promise<boolean> {
  if (marketingEmailBlockReason()) return false;
  const { apiKey, toEmail, content, unsubscribeToken, base } = params;

  try {
    const res = await fetch("https://mandrillapp.com/api/1.0/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: apiKey,
        message: {
          html: content.html,
          text: content.text,
          subject: content.subject,
          from_email: fromAddress(),
          from_name: "Brand Engage Pro",
          headers: {
            ...listUnsubscribeHeaders(oneClickUnsubscribeUrl(base, unsubscribeToken)),
            "Reply-To": replyToAddress(),
          },
          to: [{ email: toEmail, type: "to" }],
          track_opens: true,
          track_clicks: false,
          tags: ["weekly-digest", "lapsed-nudge"],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[weekly-digest] lapsed: Mandrill error:", res.status, body.slice(0, 200));
      return false;
    }
    const counts = countMandrillResults(await res.json());
    return counts.sent > 0;
  } catch (err) {
    console.error("[weekly-digest] lapsed: fetch failed:", err);
    return false;
  }
}

async function sendDigestEmail(params: {
  apiKey: string;
  toEmail: string;
  firstName: string;
  recap: Recap;
  streakDays: number;
  lastActiveDate: string | null;
  unsubscribeToken: string;
  postalAddress: string;
}): Promise<boolean> {
  if (marketingEmailBlockReason()) return false;

  const {
    apiKey,
    toEmail,
    firstName,
    recap,
    streakDays,
    lastActiveDate,
    unsubscribeToken,
    postalAddress,
  } = params;
  const base = appBaseUrl();
  const content = buildDigestContent({
    firstName,
    recap,
    streakDays,
    postalAddress,
    unsubscribeHref: unsubscribeUrl(base, unsubscribeToken),
    homeHref: base,
    lastActiveDate,
  });

  try {
    const res = await fetch("https://mandrillapp.com/api/1.0/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: apiKey,
        message: {
          html: content.html,
          text: content.text,
          subject: content.subject,
          from_email: fromAddress(),
          from_name: "Brand Engage Pro",
          headers: {
            ...listUnsubscribeHeaders(oneClickUnsubscribeUrl(base, unsubscribeToken)),
            "Reply-To": replyToAddress(),
          },
          to: [{ email: toEmail, type: "to" }],
          track_opens: true,
          track_clicks: false,
          tags: ["weekly-digest"],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[weekly-digest] Mandrill error:", res.status, body.slice(0, 200));
      return false;
    }

    const counts = countMandrillResults(await res.json());
    return counts.sent > 0;
  } catch (err) {
    console.error("[weekly-digest] fetch failed:", err);
    return false;
  }
}
