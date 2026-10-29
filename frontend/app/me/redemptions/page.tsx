import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listMemberWallet } from "@/lib/data/redemptions";
import {
  appBaseUrl,
  codeLookupUrl,
  formatShortCode,
  partitionWallet,
  walletStatusLabel,
  type WalletItem,
} from "@/lib/redemption-code";
import CodeQR from "./code-qr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "My Redemptions" };

/**
 * Member wallet: everything they can show at the counter, newest first,
 * then a collapsed history. Reads via lib/data/redemptions with the
 * session user's id.
 */
export default async function MyRedemptionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/redemptions");

  const items = await listMemberWallet(user.id);
  const { active, history } = partitionWallet(items);
  const base = appBaseUrl();

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-iron/70">Your wallet</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">My Redemptions</h1>
        <p className="mt-2 text-sm text-iron/70">
          Rewards you have claimed and perks you have earned. Show the code or QR at the counter.
        </p>
      </header>

      {active.length === 0 && history.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="space-y-4" aria-labelledby="ready-heading">
            <h2 id="ready-heading" className="text-sm font-semibold uppercase tracking-widest text-iron/70">
              Ready to use{active.length > 0 ? ` · ${active.length}` : ""}
            </h2>
            {active.length === 0 ? (
              <div className="rounded-lg border border-iron/10 bg-linen p-6 text-center shadow-glass">
                <p className="text-sm text-iron/70">Nothing waiting right now.</p>
                <Link href="/rewards" className="mt-2 inline-block text-sm font-medium underline">
                  Browse rewards
                </Link>
              </div>
            ) : (
              active.map((item) => <ActiveCard key={`${item.kind}-${item.id}`} item={item} base={base} />)
            )}
          </section>

          {history.length > 0 && (
            <details className="group rounded-lg border border-iron/10 bg-linen shadow-glass">
              <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-semibold uppercase tracking-widest text-iron/70 [&::-webkit-details-marker]:hidden">
                History · {history.length}
                <span aria-hidden className="text-base transition group-open:rotate-180">⌄</span>
              </summary>
              <ul className="divide-y divide-iron/10 border-t border-iron/10">
                {history.map((item) => (
                  <HistoryRow key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <div className="flex flex-col gap-3">
        <Link
          href="/me/card"
          className="block w-full rounded-full border border-iron/15 py-3 text-center text-sm font-medium text-iron/70 hover:bg-iron/5 transition"
        >
          My member card
        </Link>
        <Link
          href="/rewards"
          className="block w-full rounded-full border border-iron/15 py-3 text-center text-sm font-medium text-iron/70 hover:bg-iron/5 transition"
        >
          Browse rewards
        </Link>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-iron/10 bg-linen p-8 text-center shadow-glass">
      <p className="text-lg font-semibold">Nothing here yet</p>
      <p className="mt-2 text-sm text-iron/70">
        When you redeem a reward or earn a perk it shows up here with a code to show at the counter.
      </p>
      <Link
        href="/rewards"
        className="mt-5 inline-block rounded-full bg-iron px-6 py-3 text-sm font-medium text-linen hover:bg-iron/90 transition"
      >
        Browse rewards
      </Link>
    </div>
  );
}

function ActiveCard({ item, base }: { item: WalletItem; base: string }) {
  const code = item.code;
  return (
    <article
      className="relative overflow-hidden rounded-lg border border-iron/10 bg-linen p-6 shadow-glass"
      aria-label={`${item.title} from ${item.brandName}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-iron/70">{item.brandName}</p>
          <h3 className="mt-1 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {item.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-aurora/20 px-3 py-1 text-xs font-semibold">
          {walletStatusLabel(item.status)}
        </span>
      </div>

      <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="text-xs uppercase tracking-widest text-iron/70">Your code</p>
          {code ? (
            <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.25em] tabular-nums">
              {formatShortCode(code)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-iron/70">Code on its way — refresh in a moment.</p>
          )}
          <p className="mt-3 text-sm text-iron/70">Show this at the counter.</p>
          <p className="mt-1 text-xs text-iron/50">
            {item.kind === "perk" ? "Earned" : "Claimed"}{" "}
            {new Date(item.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        {code && <CodeQR value={codeLookupUrl(code, base)} />}
      </div>

      {item.note && <p className="mt-4 text-xs text-iron/60">{item.note}</p>}
    </article>
  );
}

function HistoryRow({ item }: { item: WalletItem }) {
  const when = item.resolvedAt ?? item.createdAt;
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-xs text-iron/60">
          {item.brandName}
          {item.code ? ` · ${formatShortCode(item.code)}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold text-iron/70">{walletStatusLabel(item.status)}</p>
        <p className="text-xs text-iron/50">{new Date(when).toLocaleDateString()}</p>
      </div>
    </li>
  );
}
