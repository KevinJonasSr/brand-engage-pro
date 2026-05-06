/**
 * /api/cron/fraud-scan (BEP)
 * BEP mirror of FE — uses member_id field on fraud_signals.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanForFraud } from "@/lib/fraud-detection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const FLAG_CONFIDENCE_THRESHOLD = 0.6;

interface RunResult {
  ok: boolean;
  scanned: number;
  flagged: number;
  legitimate: number;
  unclear_below_threshold: number;
  errors: number;
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const result: RunResult = {
    ok: true,
    scanned: 0,
    flagged: 0,
    legitimate: 0,
    unclear_below_threshold: 0,
    errors: 0,
  };

  let flags;
  try {
    flags = await scanForFraud(admin);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "scan_failed", detail: String(err) },
      { status: 500 },
    );
  }

  result.scanned = flags.length;

  for (const flag of flags) {
    if (flag.verdict === "legitimate") {
      result.legitimate += 1;
      continue;
    }
    if (flag.confidence < FLAG_CONFIDENCE_THRESHOLD) {
      result.unclear_below_threshold += 1;
      continue;
    }

    try {
      const { error: insertErr } = await admin.from("fraud_signals").insert({
        member_id: flag.member_id,
        verdict: flag.verdict,
        confidence: flag.confidence,
        triggers: flag.triggers,
        reasons: flag.reasons,
        evidence_json: flag.evidence,
        status: "pending",
      });
      if (insertErr) throw insertErr;
      result.flagged += 1;
    } catch (err) {
      result.errors += 1;
      console.warn("[cron fraud-scan] failed to insert flag", flag.member_id, err);
    }
  }

  return NextResponse.json(result);
}
