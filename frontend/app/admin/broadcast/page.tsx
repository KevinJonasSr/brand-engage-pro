"use client";

import { useState, useTransition } from "react";
import { sendBroadcast } from "./actions";
import type { BroadcastFormResult } from "./actions";

const TIER_OPTIONS = [
  { value: "all", label: "All followers" },
  { value: "bronze", label: "Bronze+" },
  { value: "silver", label: "Silver+" },
  { value: "gold", label: "Gold+" },
  { value: "platinum", label: "Platinum only" },
];

// Email channel removed until Mailchimp brand/tier segments exist
// (broadcastEmail currently blasts the full audience).
const CHANNEL_OPTIONS = [
  { value: "sms", label: "SMS" },
];

const SMS_LIMIT = 160;

export default function BroadcastPage() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BroadcastFormResult | null>(null);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirmed) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setResult(null);
    startTransition(async () => {
      const res = await sendBroadcast(fd);
      setResult(res);
      setConfirmed(false);
      if (res.ok) {
        setMessage("");
        (form.querySelector("[name=message]") as HTMLTextAreaElement | null)?.focus();
      }
    });
  }

  const charsLeft = SMS_LIMIT - message.length;

  return (
    <div className="space-y-8 max-w-2xl">
      <header>
        <p className="text-xs uppercase tracking-wide text-white/60">Admin · Broadcast</p>
        <h1 className="mt-1 text-2xl font-semibold">Send a broadcast</h1>
        <p className="mt-2 text-sm text-white/60">
          Message your members directly via SMS — target by tier. Every send
          is logged to Campaigns for your records. Email broadcast is temporarily
          disabled until brand-scoped segments are ready.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Brand slug — hidden, pulled from admin context server-side.
            For super-admins this could be a picker; for single-brand it's fixed. */}
        <input type="hidden" name="brand_slug" value="nellies" />

        {/* Tier filter */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-white/80">Audience</legend>
          <div className="flex flex-wrap gap-2">
            {TIER_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm transition has-[:checked]:border-aurora has-[:checked]:bg-aurora/10"
              >
                <input
                  type="radio"
                  name="tier_filter"
                  value={opt.value}
                  defaultChecked={opt.value === "all"}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Channel — SMS only for soft launch */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-white/80">Channel</legend>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm transition has-[:checked]:border-aurora has-[:checked]:bg-aurora/10"
              >
                <input
                  type="radio"
                  name="channel"
                  value={opt.value}
                  defaultChecked
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Message */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="message" className="text-sm font-medium text-white/80">
              Message
            </label>
            <span
              className={`text-xs ${charsLeft < 20 ? "text-red-400" : "text-white/40"}`}
            >
              {charsLeft} chars left (SMS)
            </span>
          </div>
          <textarea
            id="message"
            name="message"
            rows={4}
            required
            maxLength={SMS_LIMIT}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setConfirmed(false);
            }}
            placeholder="Hey Nellie's fam! Tonight only — show this text for a complimentary sweet tea. 🍹"
            className="w-full resize-none rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-white placeholder:text-white/30 focus:border-aurora/60 focus:outline-none"
          />
          {message.length > 0 && (
            <p className="text-xs text-white/40">
              Recipients will see:{" "}
              <span className="text-white/60">
                {message} Reply STOP to opt out.
              </span>
            </p>
          )}
        </div>

        {/* Confirm guard */}
        {message.length > 0 && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 accent-aurora"
            />
            <span className="text-sm text-white/70">
              I&apos;ve reviewed this message and confirm I want to send it to opted-in
              members. This action cannot be undone.
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={isPending || !confirmed || !message.trim()}
          className="w-full rounded-full bg-gradient-to-r from-aurora to-ember py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Sending…" : "Send broadcast"}
        </button>
      </form>

      {/* Result */}
      {result && (
        <div
          className={`rounded-2xl border p-5 text-sm ${
            result.ok
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-red-400/30 bg-red-400/10 text-red-300"
          }`}
        >
          {result.ok ? (
            <p>
              ✓ Sent — {result.smsSent ?? 0} SMS delivered. Logged to{" "}
              <a href="/admin/campaigns" className="underline underline-offset-2">
                Campaigns
              </a>
              .
            </p>
          ) : (
            <p>⚠ {result.error}</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-xs text-white/50 space-y-1">
        <p className="font-medium text-white/60">Good to know</p>
        <p>• SMS recipients must have opted in and have a verified phone number.</p>
        <p>• Email broadcast is disabled (unscoped Mailchimp audience risk).</p>
        <p>• All sends are throttled (250 ms/msg) to stay within carrier rate limits.</p>
        <p>• Every broadcast is logged under <a href="/admin/campaigns" className="underline underline-offset-2">Campaigns</a> with recipient counts.</p>
      </div>
    </div>
  );
}
