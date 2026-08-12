"use client";

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileOptions {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
}

interface Props {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
}

const SCRIPT_ID = "cf-turnstile-script";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function TurnstileWidget({ onSuccess, onError, onExpire, theme = "light" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !SITE_KEY) return;
    if (widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      theme,
      callback: onSuccess,
      "error-callback": onError,
      "expired-callback": onExpire,
    });
  }, [onSuccess, onError, onExpire, theme]);

  useEffect(() => {
    if (!SITE_KEY) return;

    if (window.turnstile) {
      renderWidget();
      return;
    }

    window.onTurnstileLoad = renderWidget;

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  if (!SITE_KEY) {
    if (process.env.NODE_ENV === "production") {
      return (
        <p className="mt-5 text-sm text-red-300">
          Security check unavailable. Please try again later.
        </p>
      );
    }
    return null;
  }

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] uppercase tracking-widest text-white/35">Security check</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div ref={containerRef} className="overflow-hidden rounded-xl" />
    </div>
  );
}

/**
 * Call from a form submit handler to verify the token server-side.
 *
 * Production builds require NEXT_PUBLIC_TURNSTILE_SITE_KEY — missing key fails closed.
 * Non-production builds without a site key skip the client check so local login works;
 * the server still enforces TURNSTILE_SECRET_KEY / TURNSTILE_ALLOW_BYPASS rules.
 */
export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  if (!SITE_KEY) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[turnstile] NEXT_PUBLIC_TURNSTILE_SITE_KEY is not configured in production",
      );
      return false;
    }
    return true;
  }
  if (!token) return false;

  try {
    const res = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json()) as { success: boolean; message?: string };
    if (!data.success && data.message) {
      console.warn("[turnstile]", data.message);
    }
    return data.success === true;
  } catch {
    return false;
  }
}
