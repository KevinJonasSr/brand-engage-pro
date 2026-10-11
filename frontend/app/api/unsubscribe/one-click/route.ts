import { NextResponse } from "next/server";
import { isOneClickUnsubscribeBody } from "@/lib/email-campaign";
import { unsubscribeEmailByToken } from "@/lib/email-unsubscribe";

export const dynamic = "force-dynamic";

/**
 * POST /api/unsubscribe/one-click?token=...
 *
 * RFC 8058 one-click unsubscribe. Mail clients POST
 * `List-Unsubscribe=One-Click` to the List-Unsubscribe HTTPS URL.
 * A GET does not unsubscribe anyone (link scanners open links).
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let body = "";
  try {
    body = await req.text();
  } catch {
    body = "";
  }
  if (!isOneClickUnsubscribeBody(body)) {
    return new NextResponse("Expected List-Unsubscribe=One-Click", { status: 400 });
  }

  const result = await unsubscribeEmailByToken(token);
  if (result === "not_found") return new NextResponse("Not found", { status: 404 });
  if (result === "error") return new NextResponse("Error", { status: 500 });
  return new NextResponse(null, { status: 200 });
}

export function GET() {
  return new NextResponse("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
