import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { gatherWeeklyRecap } from "@/lib/personal-recap/gather";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/cron/weekly-member-digest
 *
 * Weekly cron (Sundays at 6 PM ET). For every email-opted-in member who had
 * activity in the past 7 days, computes their personal recap and sends a
 * summary email via Mailchimp transactional (Mandrill).
 *
 * Requires env vars: MAILCHIMP_TRANSACTIONAL_API_KEY (Mandrill key, starts with "md-")
 * Falls back gracefully if the key is missing — logs a warning, skips sends.
 */
export async function GET(req: Request) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const mandrillKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY;
  if (!mandrillKey) {
    console.warn(
      "[weekly-digest] MAILCHIMP_TRANSACTIONAL_API_KEY not set — skipping email sends",
    );
  }

  const admin = createAdminClient();

  // Fetch all email-opted-in, non-suspended members with an email address
  const { data: members, error } = await admin
    .from("members")
    .select("id, first_name, email, current_streak_days")
    .eq("email_opted_in", true)
    .eq("suspended", false)
    .not("email", "is", null);

  if (error) {
    console.error("[weekly-digest] Failed to fetch members:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of members ?? []) {
    try {
      const recap = await gatherWeeklyRecap(member.id as string);

      // Skip members with no activity this week (don't email inactive members)
      if (!recap.hasActivity) {
        skipped++;
        continue;
      }

      if (mandrillKey) {
        const ok = await sendDigestEmail({
          apiKey: mandrillKey,
          toEmail: member.email as string,
          firstName: (member.first_name as string | null) ?? "there",
          recap,
          streakDays: (member.current_streak_days as number | null) ?? 0,
        });
        if (ok) sent++;
        else failed++;
      } else {
        // Dry-run mode: log what would have been sent
        console.log(
          `[weekly-digest] would send to ${member.email} — ` +
            `${recap.pointsEarned} pts, ${recap.commentsAdded} comments, ` +
            `${recap.rsvpsAdded} RSVPs`,
        );
        sent++;
      }
    } catch (err) {
      console.error("[weekly-digest] Error processing member", member.id, err);
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    failed,
    ranAt: new Date().toISOString(),
  });
}

// ── Email builder ───────────────────────────────────────────────────────────

type Recap = Awaited<ReturnType<typeof gatherWeeklyRecap>>;

async function sendDigestEmail(params: {
  apiKey: string;
  toEmail: string;
  firstName: string;
  recap: Recap;
  streakDays: number;
}): Promise<boolean> {
  const { apiKey, toEmail, firstName, recap, streakDays } = params;

  const html = buildEmailHtml({ firstName, recap, streakDays });

  try {
    const res = await fetch("https://mandrillapp.com/api/1.0/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: apiKey,
        message: {
          html,
          subject: `Your week at ${recap.topBrandName ?? "Brand Engage Pro"} ✨`,
          from_email: "hello@brand-engage-pro.vercel.app",
          from_name: "Brand Engage Pro",
          to: [{ email: toEmail, type: "to" }],
          track_opens: true,
          track_clicks: false,
          tags: ["weekly-digest"],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[weekly-digest] Mandrill error:", body);
      return false;
    }

    const data = (await res.json()) as Array<{ status: string }>;
    return data[0]?.status === "sent" || data[0]?.status === "queued";
  } catch (err) {
    console.error("[weekly-digest] fetch failed:", err);
    return false;
  }
}

function buildEmailHtml(params: {
  firstName: string;
  recap: Recap;
  streakDays: number;
}): string {
  const { firstName, recap, streakDays } = params;

  const stats = [
    recap.pointsEarned > 0
      ? `<b>${recap.pointsEarned}</b> points earned`
      : null,
    recap.rsvpsAdded > 0
      ? `<b>${recap.rsvpsAdded}</b> event RSVP${recap.rsvpsAdded > 1 ? "s" : ""}`
      : null,
    recap.commentsAdded > 0
      ? `<b>${recap.commentsAdded}</b> comment${recap.commentsAdded > 1 ? "s" : ""}`
      : null,
    recap.reactionsGiven > 0
      ? `<b>${recap.reactionsGiven}</b> reaction${recap.reactionsGiven > 1 ? "s" : ""} given`
      : null,
    streakDays > 0 ? `<b>${streakDays}-day</b> visit streak` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const brandLine = recap.topBrandName
    ? `<p style="color:#a0aec0;font-size:13px;">Your most active brand this week: <b style="color:#e2e8f0;">${recap.topBrandName}</b></p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#050b1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050b1f;padding:40px 20px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:linear-gradient(135deg,rgba(124,58,237,0.15),#0f172a);border:1px solid rgba(255,255,255,0.1);border-radius:24px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 32px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#94a3b8;">Brand Engage Pro</p>
          <h1 style="margin:0 0 24px;font-size:26px;font-weight:600;line-height:1.2;">Hey ${firstName}, here&rsquo;s your week 👋</h1>
        </td></tr>
        <!-- Stats -->
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#e2e8f0;">${stats}</p>
          ${brandLine}
        </td></tr>
        <!-- CTA -->
        <tr><td style="padding:0 32px 32px;">
          <a href="https://brand-engage-pro.vercel.app" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#f56528);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:999px;">
            See your dashboard →
          </a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:11px;color:#475569;">You're getting this because you opted in to Brand Engage Pro member emails. <a href="https://brand-engage-pro.vercel.app/unsubscribe" style="color:#7c3aed;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
