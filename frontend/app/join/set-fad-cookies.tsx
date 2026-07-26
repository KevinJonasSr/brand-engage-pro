"use client";

import { useEffect } from "react";

type FadCookies = {
  fad_ref?: string;
  fad_tenant?: string;
  fad_campaign?: string;
  fad_channel?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

export default function SetFadCookies({ values }: { values: FadCookies }) {
  useEffect(() => {
    const maxAge = 60 * 60 * 24 * 30;
    for (const [key, value] of Object.entries(values)) {
      if (!value) continue;
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
  }, [values]);
  return null;
}
