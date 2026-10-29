import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { findWalletItemByCode } from "@/lib/data/redemptions";
import {
  formatShortCode,
  isActiveWalletItem,
  isValidShortCode,
  normalizeShortCode,
  walletStatusLabel,
} from "@/lib/redemption-code";
import CodeSearch from "./code-search";
import CodeActions from "./code-actions";

export const dynamic = "force-dynamic";

/**
 * Staff lookup for a counter code. Reached by typing the code or by
 * scanning the QR on the member's wallet, which encodes this URL.
 * Brand admins only see codes from their own brands; super-admins see all.
 */
export default async function RedemptionCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeShortCode(decodeURIComponent(rawCode));

  const ctx = await getAdminContext();
  if (!ctx) redirect(`/login?next=/admin/redemptions/${encodeURIComponent(code || rawCode)}`);

  const valid = isValidShortCode(code);
  const lookup = valid ? await findWalletItemByCode(code, ctx) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/redemptions" className="text-xs text-iron/70 hover:underline">
            ← Redemption queue
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Code lookup</h1>
        </div>
        <CodeSearch initial={valid ? formatShortCode(code) : ""} />
      </div>

      {!valid ? (
        <div className="glass-card rounded-lg p-8 text-center">
          <p className="font-medium">That is not a valid code.</p>
          <p className="mt-1 text-sm text-iron/70">
            Codes are six letters and numbers and never contain 0, O, 1 or I.
          </p>
        </div>
      ) : !lookup ? (
        <div className="glass-card rounded-lg p-8 text-center">
          <p className="font-mono text-2xl tracking-widest">{formatShortCode(code)}</p>
          <p className="mt-3 font-medium">No redemption found for this code.</p>
          <p className="mt-1 text-sm text-iron/70">
            Check the code with the member, or it may belong to a brand you do not manage.
          </p>
        </div>
      ) : (
        <LookupResult lookup={lookup} />
      )}
    </div>
  );
}

function LookupResult({
  lookup,
}: {
  lookup: NonNullable<Awaited<ReturnType<typeof findWalletItemByCode>>>;
}) {
  const { item, member } = lookup;
  const active = isActiveWalletItem(item);
  const statusTone = active
    ? "bg-yellow-500/20 text-aurora-ink"
    : item.status === "cancelled"
      ? "bg-red-500/15 text-ember"
      : "bg-green-500/20 text-sage-ink";

  return (
    <div className="glass-card overflow-hidden rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-iron/5 p-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-iron/70">{item.brandName}</p>
          <p className="mt-1 font-mono text-3xl tracking-[0.3em]">{formatShortCode(item.code ?? "")}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone}`}>
          {walletStatusLabel(item.status)}
        </span>
      </div>

      <dl className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-widest text-iron/70">Member</dt>
          <dd className="mt-1 flex items-center gap-3">
            {member.avatarUrl && (
              <span className="relative h-9 w-9 overflow-hidden rounded-full">
                <Image src={member.avatarUrl} alt="" fill className="object-cover" />
              </span>
            )}
            <span>
              <span className="block font-medium">{member.name}</span>
              {member.email && <span className="block text-xs text-iron/70">{member.email}</span>}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-iron/70">
            {item.kind === "perk" ? "Perk" : "Reward"}
          </dt>
          <dd className="mt-1 font-medium">{item.title}</dd>
          {lookup.pointCost != null && (
            <dd className="text-xs text-iron/70">{lookup.pointCost.toLocaleString()} pts</dd>
          )}
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-iron/70">
            {item.kind === "perk" ? "Granted" : "Requested"}
          </dt>
          <dd className="mt-1 text-sm">{new Date(item.createdAt).toLocaleString()}</dd>
        </div>
        {item.resolvedAt && (
          <div>
            <dt className="text-xs uppercase tracking-widest text-iron/70">
              {walletStatusLabel(item.status)}
            </dt>
            <dd className="mt-1 text-sm">{new Date(item.resolvedAt).toLocaleString()}</dd>
          </div>
        )}
        {lookup.deliveryDetails && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-widest text-iron/70">Member note</dt>
            <dd className="mt-1 text-sm">{lookup.deliveryDetails}</dd>
          </div>
        )}
        {lookup.fulfillmentNote && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-widest text-iron/70">Fulfilment note</dt>
            <dd className="mt-1 text-sm">{lookup.fulfillmentNote}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-iron/5 bg-parchment/20 p-5">
        <p className="text-sm text-iron/70">
          {active
            ? item.kind === "perk"
              ? "Hand over the perk, then mark it used."
              : "Hand over the reward, then mark it fulfilled. Refund returns the points."
            : "Nothing to do — this code has already been closed."}
        </p>
        <CodeActions kind={item.kind} id={item.id} active={active} />
      </div>
    </div>
  );
}
