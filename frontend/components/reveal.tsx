"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { revealDelayMs } from "@/lib/motion";

/**
 * Rises 24px and fades in the first time it scrolls into view
 * (.bep-reveal in globals.css). `index` staggers items in a grid by 120ms
 * each. With `enabled` false it renders a plain div, so a page can opt in
 * per brand. Reduce Motion is handled in CSS: fade only.
 */
export default function Reveal({
  children,
  index = 0,
  enabled = true,
  className,
}: {
  children: ReactNode;
  index?: number;
  enabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // Old browser: just show it on the next frame.
      const frame = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <div
      ref={ref}
      className={className ? `bep-reveal ${className}` : "bep-reveal"}
      data-revealed={revealed ? "true" : "false"}
      style={{ ["--reveal-delay" as string]: `${revealDelayMs(index)}ms` }}
    >
      {children}
    </div>
  );
}
