import type { NextRequest } from "next/server";
import { signOutAndRedirect } from "@/lib/auth-signout";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return signOutAndRedirect(request);
}

export async function POST(request: NextRequest) {
  return signOutAndRedirect(request);
}
