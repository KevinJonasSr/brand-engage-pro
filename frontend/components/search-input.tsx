"use client";

/**
 * Reusable search input. Submits to /search?q=<value> on enter.
 *
 * Used on:
 *   - The /search results page (with defaultValue=current query)
 *   - The global header (no defaultValue)
 *
 * Plain client form with router.push so we get fast client-side
 * navigation between queries instead of full reloads.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  defaultValue?: string;
  /** Compact variant for the global header. */
  compact?: boolean;
  placeholder?: string;
}

export default function SearchInput({
  defaultValue = "",
  compact = false,
  placeholder = "Search posts, communities, events…",
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const sizing = compact
    ? "h-9 text-xs"
    : "h-11 text-sm";

  return (
    <form onSubmit={onSubmit} role="search" className="w-full">
      <label className="sr-only" htmlFor="global-search">
        Search
      </label>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-iron/40"
        >
          {/* Plain magnifier glyph — no icon dependency. */}
          ⌕
        </span>
        <input
          id="global-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={`w-full rounded-full border border-iron/10 bg-parchment/40 pl-9 pr-3 text-iron placeholder-iron/40 outline-none transition focus:border-iron/30 focus:bg-parchment/60 ${sizing}`}
        />
      </div>
    </form>
  );
}

