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

const CHANNEL_OPTIONS = [
  { value: "sms", label: "Text (SMS)" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
];

const SMS_LIMIT = 160;
const EMAIL_SUBJECT_MAX = 150;
const EMAIL_BODY_MAX = 10000;

export default function BroadcastPage() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BroadcastFormResult | null>(null);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [channel, setChannel] = useState("sms");
  const [confirmed, setConfirmed] = useState(false);
  const sendsSms = channel !== "email";
  const sendsEmail = channel !== "sms";

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
        setSubject("");
        (form.querySelector("[name=message]") as HTMLTextAreaElement | null)?.focus();
      }
    });
  }

  const charsLeft = SMS_LIMIT - message.length;
  const canSend =
    message.trim().length > 0 && (!sendsEmail || subject.trim().length > 0);

  return (
    <div className="space-y-8 max-w-2xl">
      <header>
        <p className="text-xs uppercase tracking-wide text-iron/60">Admin · Broadcast</p>
        <h1 className="mt-1 text-2xl font-semibold">Send a broadcast</h1>
        <p className="mt-2 text-sm text-iron/60">
          Message your members by text, email or both, and target by tier.
          Only members who follow this brand and said yes to that channel get
          it. Every send is logged to Campaigns for your records.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* No brand field: the server sends to the admin's current brand
            (picked in the community switcher) and checks access. */}

        {/* Tier filter */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-iron/80">Audience</legend>
          <div className="flex flex-wrap gap-2">
            {TIER_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-iron/15 bg-parchment/30 px-4 py-2 text-sm transition has-[:checked]:border-aurora has-[:checked]:bg-aurora/10"
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

        {/* Channel */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-iron/80">Channel</legend>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-iron/15 bg-parchment/30 px-4 py-2 text-sm transition has-[:checked]:border-aurora has-[:checked]:bg-aurora/10"
              >
                <input
                  type="radio"
                  name="channel"
                  value={opt.value}
                  checked={channel === opt.value}
                  onChange={() => {
                    setChannel(opt.value);
                    setConfirmed(false);
                  }}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Email subject */}
        {sendsEmail && (
          <div className="space-y-2">
            <label htmlFor="subject" className="text-sm font-medium text-iron/80">
              Email subject
            </label>
            <input
              id="subject"
              name="subject"
              required
              maxLength={EMAIL_SUBJECT_MAX}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setConfirmed(false);
              }}
              placeholder="Sweet tea on us tonight"
              className="w-full rounded-xl border border-iron/15 bg-parchment/30 p-3 text-sm text-iron placeholder:text-iron/30 focus:border-aurora/60 focus:outline-none"
            />
          </div>
        )}

        {/* Message */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="message" className="text-sm font-medium text-iron/80">
              Message
            </label>
            {sendsSms && (
              <span
                className={`text-xs ${charsLeft < 20 ? "text-ember" : "text-iron/40"}`}
              >
                {charsLeft} chars left (SMS)
              </span>
            )}
          </div>
          <textarea
            id="message"
            name="message"
            rows={sendsSms ? 4 : 8}
            required
            maxLength={sendsSms ? SMS_LIMIT : EMAIL_BODY_MAX}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setConfirmed(false);
            }}
            placeholder="Hey Nellie's fam! Tonight only — show this text for a complimentary sweet tea. 🍹"
            className="w-full resize-none rounded-xl border border-iron/15 bg-parchment/30 p-4 text-sm text-iron placeholder:text-iron/30 focus:border-aurora/60 focus:outline-none"
          />
          {sendsSms && message.length > 0 && (
            <p className="text-xs text-iron/40">
              Text recipients will see:{" "}
              <span className="text-iron/60">
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
              className="mt-0.5 h-4 w-4 rounded border-iron/20 bg-parchment/30 accent-aurora"
            />
            <span className="text-sm text-iron/70">
              I&apos;ve reviewed this message and confirm I want to send it to opted-in
              members. This action cannot be undone.
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={isPending || !confirmed || !canSend}
          className="w-full rounded-full bg-ember py-3 text-sm font-semibold text-linen transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Sending…" : "Send broadcast"}
        </button>
      </form>

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg border p-5 text-sm ${
            result.ok
              ? "border-emerald-400/30 bg-emerald-400/10 text-sage-ink"
              : "border-red-400/30 bg-red-400/10 text-ember"
          }`}
        >
          {result.ok ? (
            <>
              <p>
                ✓ Sent: {result.smsSent ?? 0} texts and {result.emailSent ?? 0} emails.
                Logged to{" "}
                <a href="/admin/campaigns" className="underline underline-offset-2">
                  Campaigns
                </a>
                .
              </p>
              {(result.smsSkippedQuietHours ?? 0) > 0 && (
                <p className="mt-2 text-aurora-ink">
                  {result.smsSkippedQuietHours} texts were held back because it is quiet hours
                  (9pm to 8am) for those members. They were not sent.
                </p>
              )}
              {result.error && <p className="mt-2 text-aurora-ink">⚠ {result.error}</p>}
            </>
          ) : (
            <p>⚠ {result.error}</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-iron/10 bg-parchment/20 p-5 text-xs text-iron/50 space-y-1">
        <p className="font-medium text-iron/60">Good to know</p>
        <p>• Text recipients must have opted in and have a verified phone number.</p>
        <p>• Email recipients must have said yes to email. Each email names your brand and has its own unsubscribe link.</p>
        <p>• Text sends are throttled (250 ms/msg) to stay within carrier rate limits.</p>
        <p>• Every broadcast is logged under <a href="/admin/campaigns" className="underline underline-offset-2">Campaigns</a> with recipient counts.</p>
      </div>
    </div>
  );
}
