import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminPageScope } from "@/lib/admin";

/**
 * Counts for the overview cards. Super-admins (scope null) see platform
 * totals; brand admins see only their own brand's rows.
 */
async function getCounts(scope: string | null) {
  try {
    const admin = createAdminClient();
    const count = (table: "offers" | "referrals" | "purchases") => {
      const q = admin.from(table).select("id", { count: "exact", head: true });
      return scope ? q.eq("community_id", scope) : q;
    };
    const members = scope
      ? admin
          .from("member_community_memberships")
          .select("member_id", { count: "exact", head: true })
          .eq("community_id", scope)
      : admin.from("members").select("id", { count: "exact", head: true });
    const [membersRes, offers, referrals, purchases] = await Promise.all([
      members,
      count("offers"),
      count("referrals"),
      count("purchases"),
    ]);
    return {
      members: membersRes.count ?? 0,
      offers: offers.count ?? 0,
      referrals: referrals.count ?? 0,
      purchases: purchases.count ?? 0,
    };
  } catch {
    return { members: 0, offers: 0, referrals: 0, purchases: 0 };
  }
}

export default async function AdminOverviewPage() {
  const access = await getAdminPageScope();
  if (!access) redirect("/login?next=/admin");
  const counts = await getCounts(access.scope);
  const cards = [
    { label: "Members", value: counts.members, href: "/admin/members" },
    { label: "Offers", value: counts.offers, href: "/admin/offers" },
    { label: "Referrals", value: counts.referrals, href: "#" },
    { label: "Purchases", value: counts.purchases, href: "#" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Platform overview
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Quick glance at the member base. Use the tabs above to dive in.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-white/10 bg-black/30 p-5"
          >
            <p className="text-xs uppercase tracking-wide text-white/60">{c.label}</p>
            <p className="mt-2 text-3xl font-semibold">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
