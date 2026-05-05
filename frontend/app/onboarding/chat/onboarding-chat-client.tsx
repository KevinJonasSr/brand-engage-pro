"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendTurnAction, finishAction } from "./actions";
import type { ChatMessage } from "@/lib/onboarding-chat";

export default function OnboardingChatClient({
  initialMessage,
}: {
  initialMessage: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: initialMessage },
  ]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || busy || done) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setBusy(true);

    try {
      const result = await sendTurnAction(nextHistory);
      setMessages([
        ...nextHistory,
        { role: "assistant", content: result.message },
      ]);
      if (result.done) setDone(true);
    } catch (err) {
      setMessages([
        ...nextHistory,
        {
          role: "assistant",
          content:
            "Sorry, I hit a snag. You can keep going or skip and finish later.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleFinish() {
    if (busy || isPending) return;
    setBusy(true);
    startTransition(async () => {
      await finishAction(messages);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div
        ref={scrollRef}
        className="glass-card max-h-[50vh] min-h-[280px] space-y-3 overflow-y-auto p-5"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-aurora/30 text-white"
                  : "bg-white/10 text-white/90"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && !done && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm text-white/60">
              <span className="inline-block animate-pulse">…</span>
            </div>
          </div>
        )}
      </div>

      {!done ? (
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your reply…"
            disabled={busy}
            rows={2}
            maxLength={2000}
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm placeholder-white/40 outline-none focus:border-aurora/40 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !input.trim()}
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleFinish}
          disabled={busy || isPending}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save & continue"}
        </button>
      )}

      <Link
        href="/"
        className="text-center text-xs text-white/50 hover:text-white/80"
      >
        Skip for now
      </Link>
    </div>
  );
}
