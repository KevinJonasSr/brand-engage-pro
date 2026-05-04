"use client";

import { useEffect, useState } from "react";

/**
 * PushOptInPrompt
 *
 * Renders a small banner prompting the member to enable push notifications.
 * Hides itself when:
 *   - The browser doesn't support Service Workers + Push
 *   - Permission is already granted (subscription is active)
 *   - Permission is permanently denied
 *   - The member has dismissed the banner this session (sessionStorage flag)
 *
 * On click → registers /sw.js, requests permission, calls
 * pushManager.subscribe(), then POSTs the subscription to /api/push/subscribe.
 */

interface PushOptInPromptProps {
  /** Server-supplied. Pass null if env var is missing — banner won't render. */
  vapidPublicKey?: string | null;
  /** Already subscribed? Then don't render. */
  alreadySubscribed?: boolean;
}

function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  // Construct a fresh ArrayBuffer (not ArrayBufferLike) so the result is
  // typed strictly enough for PushSubscriptionOptions.applicationServerKey.
  // Newer TS lib.dom (Next.js 16 / TS 5.9+) tightened BufferSource to
  // exclude SharedArrayBuffer; a plain `new Uint8Array(n)` defaults to
  // Uint8Array<ArrayBufferLike> which fails the check.
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export default function PushOptInPrompt({
  vapidPublicKey,
  alreadySubscribed,
}: PushOptInPromptProps) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vapidPublicKey) return;
    if (alreadySubscribed) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!("PushManager" in window)) return;
    if (Notification.permission === "denied") return;
    if (sessionStorage.getItem("fe_push_dismissed") === "1") return;
    setShow(true);
  }, [vapidPublicKey, alreadySubscribed]);

  if (!show) return null;

  async function enablePush() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // If already subscribed (e.g., previous session, browser cache),
      // grab that and reuse it.
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("Permission was not granted.");
          setBusy(false);
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(vapidPublicKey as string),
        });
      }

      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Subscribe failed (${res.status})`);
      }

      setShow(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    sessionStorage.setItem("fe_push_dismissed", "1");
    setShow(false);
  }

  return (
    <div className="rounded-2xl border border-aurora/30 bg-gradient-to-r from-aurora/15 via-cyan-500/10 to-emerald-500/10 p-4 shadow-lg shadow-aurora/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/30 text-xl ring-1 ring-aurora/30"
            aria-hidden
          >
            🔔
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Get the drop the second it lands
            </p>
            <p className="mt-0.5 text-xs text-white/70">
              Enable notifications to hear when a brand posts, opens an
              activation or offering, or replies to you.
            </p>
            {error && (
              <p className="mt-1 text-xs text-rose-300">{error}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-3 py-2 text-xs font-medium text-white/70 hover:text-white"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={enablePush}
            disabled={busy}
            className="rounded-lg bg-aurora px-3 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Enabling…" : "Enable notifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
