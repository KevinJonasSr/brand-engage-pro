import type { CSSProperties } from "react";
import Image from "next/image";
import { messageTimeline } from "@/lib/message-stack";

/**
 * Homepage hero art (Art Direction item 4): three texts from Nellie's to a
 * regular, fanned over the real dining room photo. The stack is the one
 * lifted object on the page. Pure CSS motion, so it plays without
 * JavaScript; Reduce Motion shows all three at rest.
 */
const MESSAGES = [
  { body: "Your table's ready.", time: "6:42 PM", tilt: "-rotate-2", offset: "ml-0" },
  { body: "Sunday biscuits are back.", time: "Sat 10:05 AM", tilt: "rotate-1", offset: "ml-6 sm:ml-10" },
  { body: "Thanks for coming in, Sam.", time: "Sun 1:18 PM", tilt: "-rotate-1", offset: "ml-2 sm:ml-4" },
] as const;

const TIMELINE = messageTimeline(MESSAGES.length);

export function MessageStackHero() {
  return (
    <figure className="relative">
      <div className="relative h-[440px] overflow-hidden rounded-lg border border-iron/10 sm:h-[480px] lg:h-[540px]">
        <Image
          src="/brands/nellies/dining-room.jpg"
          alt="The dining room at Nellie's Southern Kitchen"
          fill
          priority
          sizes="(min-width: 1024px) 480px, 100vw"
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-linen/90 via-linen/30 to-transparent"
        />
        <ol
          aria-label="Text messages from Nellie's Southern Kitchen"
          className="absolute inset-x-4 bottom-5 flex flex-col gap-3 sm:inset-x-6 sm:bottom-6"
        >
          {MESSAGES.map((m, i) => (
            <li key={m.body} className={`${m.offset} ${m.tilt} max-w-[300px]`}>
              <div
                className="bep-message rounded-lg border border-iron/15 bg-linen px-4 py-3 shadow-[0_18px_40px_-18px_rgba(30,27,23,0.45),0_2px_6px_rgba(30,27,23,0.08)]"
                style={{ "--message-delay": `${TIMELINE[i].messageDelayMs}ms` } as CSSProperties}
              >
                <p className="flex items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-iron/70">
                  <span>Nellie&apos;s</span>
                  <span>{m.time}</span>
                </p>
                <p className="mt-1 text-[15px] leading-snug text-iron">{m.body}</p>
                <p
                  className="bep-delivered mt-1.5 text-right text-[11px] font-medium text-sage-ink"
                  style={{ "--tick-delay": `${TIMELINE[i].tickDelayMs}ms` } as CSSProperties}
                >
                  Delivered <span aria-hidden>✓</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-3 text-xs text-iron/70">
        The dining room at Nellie&apos;s Southern Kitchen in Belmont, NC.
      </figcaption>
    </figure>
  );
}
