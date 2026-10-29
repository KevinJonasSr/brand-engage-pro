"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasBrowserSignedOutMarker } from "@/lib/auth-cookies";

/**
 * Tasteful "Install Brand Engage Pro" prompt that appears after a member
 * engages for a bit (not immediately on first visit). Listens for the
 * browser's `beforeinstallprompt` event so we can offer our own button
 * instead of relying on the browser's mini-infobar. (The service worker
 * itself is registered by components/register-sw.tsx.)
 *
 * Gated on the member having at least one brand follow — anonymous visitors
 * and brand-new sign-ups shouldn't see the install banner before they've
 * actually engaged with the product. This avoids competing with the
 * conversion path on first impression.
 *
 * Works on Chromium browsers and Android Chrome. iOS Safari has no
 * programmatic install event — we show a text tip there instead.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_KEY = "memberengage_install_dismissed";

// External-store reader so we can short-circuit without a setState-in-effect.
function subscribe() { return () => {}; }
function getSnapshot(): string | null {
  try { return window.localStorage.getItem(DISMISSED_KEY); } catch { return null; }
}
function getServerSnapshot(): string | null { return null; }

export default function InstallPrompt() {
  const storedDismissal = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const dismissed = storedDismissal !== null || sessionDismissed;

  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  // Gate: only show the install prompt once the member has skin in the game
  // (i.e. has followed at least one brand). Avoids prompting visitors who
  // haven't signed up yet — those should be converted to members first.
  const [hasFollows, setHasFollows] = useState(false);

  // Read userAgent via a store so we can use it in render without
  // triggering setState-in-effect lint.
  const ua = useSyncExternalStore(
    () => () => {},
    () => (typeof window !== "undefined" ? window.navigator.userAgent : ""),
    () => "",
  );
  const isIos = /iPad|iPhone|iPod/.test(ua);

  // Check whether the signed-in member has at least one follow before we
  // arm the install-prompt timer. Skip auth doors — createClient().getUser()
  // here was reminting leftover N24 onto /signup.
  useEffect(() => {
    if (dismissed) return;
    if (hasBrowserSignedOutMarker()) return;
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (
        path === "/signup" ||
        path === "/login" ||
        path === "/logout" ||
        path === "/signout" ||
        path === "/join"
      ) {
        return;
      }
    }
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !mounted) return;
      supabase
        .from("member_brand_following")
        .select("member_id", { count: "exact", head: true })
        .eq("member_id", user.id)
        .then(({ count }) => {
          if (mounted && count && count > 0) {
            setHasFollows(true);
          }
        });
    });
    return () => {
      mounted = false;
    };
  }, [dismissed]);

  useEffect(() => {
    if (dismissed || !hasFollows) return;

    // Service worker registration lives in components/register-sw.tsx
    // (mounted unconditionally from app/layout.tsx), so the banner no
    // longer gates it.

    // Already installed? standalone display-mode detection.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 15000);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS has no install event — surface the tip after 20s.
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIos) {
      iosTimer = setTimeout(() => setShow(true), 20000);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, [dismissed, hasFollows, isIos]);

  function dismiss() {
    try {
      window.localStorage.setItem(
        DISMISSED_KEY,
        JSON.stringify({ at: new Date().toISOString() }),
      );
    } catch {
      /* ignore */
    }
    setSessionDismissed(true);
    setShow(false);
  }

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      dismiss();
    }
  }

  if (dismissed || !show) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 rounded-lg border border-iron/15 bg-linen/95 p-4 shadow-xl backdrop-blur md:inset-x-auto md:right-4 md:max-w-sm">
      <p className="text-sm font-semibold">Install Brand Engage Pro</p>
      {isIos ? (
        <p className="mt-1 text-xs text-iron/70">
          Tap <span className="font-semibold">Share</span> → <span className="font-semibold">Add to Home Screen</span> to install.
        </p>
      ) : (
        <p className="mt-1 text-xs text-iron/70">
          Add Brand Engage Pro to your home screen for quick access to your brands, events, and rewards.
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={dismiss}
          className="rounded-full border border-iron/20 px-3 py-1 text-xs text-iron/70 hover:bg-iron/10"
        >
          Not now
        </button>
        {!isIos && deferred && (
          <button
            onClick={handleInstall}
            className="rounded-full bg-ember px-3 py-1 text-xs font-semibold text-linen"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
