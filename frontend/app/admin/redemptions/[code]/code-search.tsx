"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidShortCode, normalizeShortCode } from "@/lib/redemption-code";

/**
 * Type-or-paste a counter code and jump to its lookup page. Accepts the
 * raw code, the spaced display form, or a scanned lookup URL.
 */
export default function CodeSearch({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeShortCode(value);
    if (!isValidShortCode(code)) {
      setError("Codes are 6 letters/numbers, e.g. K7M 3PX (no 0, O, 1 or I).");
      return;
    }
    setError(null);
    router.push(`/admin/redemptions/${code}`);
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter a code, e.g. K7M 3PX"
          aria-label="Redemption code"
          className="w-48 rounded-lg border border-iron/10 bg-parchment/50 px-3 py-2 font-mono text-sm uppercase tracking-widest text-iron placeholder-iron/40 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans focus:border-iron/30 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-iron px-4 py-2 text-sm font-medium text-linen hover:bg-iron/90"
        >
          Look up
        </button>
      </div>
      {error && <p className="text-xs text-ember">{error}</p>}
    </form>
  );
}
