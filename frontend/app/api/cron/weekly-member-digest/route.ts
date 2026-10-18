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
 */
export async function GET(req: Request) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const testEmail = parseTestEmailParam(new URL(req.url).searchParams.get("testEmail"));
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

  const mandrillKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY?.trim() ?? "";
  const address = mailingAddress();
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

  const admin = createAdminClient();
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

  return NextResponse.json({
    ok: failed === 0,
    sent,
    skipped,
    failed,
    testSend: Boolean(testEmail),
    ranAt: new Date().toISOString(),
  });
}

type Recap = Awaited<ReturnType<typeof gatherWeeklyRecap>>;

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
