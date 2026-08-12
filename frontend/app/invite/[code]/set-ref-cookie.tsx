"use client";

import { useEffect } from "react";
import { allowsNonEssentialCookies } from "@/lib/cookie-consent";

/**
 * Writes the memberengage_ref cookie on mount when the visitor has accepted
 * non-essential cookies. Has to be a client component because Next.js only
 * permits cookie mutation inside Server Actions and Route Handlers — not page
 * components — and consent is stored in localStorage.
 *
 * Referral attribution still works via `?ref=` on signup/login/onboarding links
 * when the cookie is not set.
 */
export default function SetRefCookie({ code }: { code: string }) {
  useEffect(() => {
    if (!allowsNonEssentialCookies()) return;
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    document.cookie = `memberengage_ref=${encodeURIComponent(code)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }, [code]);
  return null;
}
