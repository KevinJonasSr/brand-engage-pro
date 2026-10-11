import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";

export const dynamic = "force-dynamic";

interface Founder {
  member_id: string;
  founder_number: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  subscription_tier: string;
  joined_at: string;
  billing_period: string | null;
  monthly_credit_cents: number;
}

interface CommunityData {
  slug: string;
  display_name: string;
  accent_from: string;
  accent_to: string;
  founder_cap: number;
  founders: Founder[];
}

async function getFoundersData(): Promise<CommunityData[]> {
  const ctx = await getAdminContext();
  if (!ctx) return [];

  const admin = createAdminClient();

  // Get all communities this admin can see
  const communities = ctx.isSuperAdmin
    ? await admin.from("communities").select("*")
    : await admin
        .from("communities")
        .select("*")
        .in(
          "slug",
          ctx.communities.length > 0
            ? ctx.communities
            : [ctx.currentCommunityId]
        );

  if (communities.error || !communities.data) return [];

  const result: CommunityData[] = [];

  for (const community of communities.data) {
    const foundersResult = await admin
      .from("member_community_memberships")
      .select(
        `
        member_id,
        founder_number,
        subscription_tier,
        joined_at,
        billing_period,
        monthly_credit_cents,
        members:members (
          id,
          first_name,
          last_name,
          email,
          avatar_url
        )
      `
      )
      .eq("community_id", community.slug)
      .eq("is_founder", true)
      .order("founder_number", { ascending: true });

    const founders: Founder[] = (foundersResult.data ?? [])
      .map((row: any) => {
        const member = Array.isArray(row.members)
          ? row.members[0]
          : row.members || {};
        return {
          member_id: row.member_id,
          founder_number: row.founder_number,
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email,
          avatar_url: member.avatar_url,
          subscription_tier: row.subscription_tier,
          joined_at: row.joined_at,
          billing_period: row.billing_period,
          monthly_credit_cents: row.monthly_credit_cents,
        };
      })
      .filter((f) => f.founder_number !== null);

    result.push({
      slug: community.slug,
      display_name: community.display_name,
      accent_from: community.accent_from,
      accent_to: community.accent_to,
      founder_cap: community.founder_cap || 0,
      founders,
    });
  }

  return result.sort((a, b) => a.display_name.localeCompare(b.display_name));
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function getTierBadgeColor(
  tier: string
): { bg: string; text: string } {
  switch (tier) {
    case "premium":
      return { bg: "bg-emerald-500/20", text: "text-sage-ink" };
    case "comped":
      return { bg: "bg-aurora/20", text: "text-aurora-ink" };
    case "past_due":
      return { bg: "bg-amber-500/20", text: "text-aurora-ink" };
    case "cancelled":
      return { bg: "bg-rose-500/20", text: "text-ember" };
    default:
      return { bg: "bg-iron/10", text: "text-iron/70" };
  }
}

export default async function AdminFoundersPage() {
  const ctx = await getAdminContext();
  if (!ctx) notFound();

  const communities = await getFoundersData();

  if (communities.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Founder rosters
          </h1>
          <p className="mt-2 text-sm text-iron/70">
            View founding members per community.
          </p>
        </div>
        <div className="rounded-lg border border-iron/10 bg-parchment/30 p-8 text-center">
          <p className="text-iron/70">No communities found or no access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Founder rosters
        </h1>
        <p className="mt-2 text-sm text-iron/70">
          Founding members per community. Sorted by founder number within each community.
        </p>
      </div>

      {communities.map((community) => (
        <div key={community.slug} className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="h-3 w-3 rounded-full"
              style={{
                backgroundImage: `linear-gradient(135deg, ${community.accent_from}, ${community.accent_to})`,
              }}
            />
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {community.display_name}
            </h2>
            <span className="ml-auto text-xs text-iron/70">
              {community.founders.length} / {community.founder_cap} slots
            </span>
          </div>

          {community.founders.length === 0 ? (
            <div className="rounded-lg border border-iron/10 bg-parchment/30 p-6 text-center">
              <p className="text-sm text-iron/70">
                No founders yet in this community.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-iron/10">
              <table className="w-full text-sm">
                <thead className="bg-parchment/40 text-left text-xs uppercase tracking-wide text-iron/70">
                  <tr>
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Billing</th>
                    <th className="px-4 py-3 text-right">Monthly credit</th>
                  </tr>
                </thead>
                <tbody>
                  {community.founders.map((founder) => (
                    <tr key={`${community.slug}-${founder.member_id}`} className="border-t border-iron/5">
                      <td className="px-4 py-3 font-semibold text-iron/70">
                        {founder.founder_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {founder.avatar_url && (
                            <Image
                              src={founder.avatar_url}
                              alt={`${founder.first_name} ${founder.last_name}`}
                              width={32}
                              height={32}
                              className="rounded-full"
                            />
                          )}
                          <span className="text-iron">
                            {[founder.first_name, founder.last_name]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-iron/70">
                        {founder.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            getTierBadgeColor(founder.subscription_tier).bg
                          } ${getTierBadgeColor(founder.subscription_tier).text}`}
                        >
                          {founder.subscription_tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-iron/70">
                        {formatDate(founder.joined_at)}
                      </td>
                      <td className="px-4 py-3 text-iron/70">
                        {founder.billing_period
                          ? founder.billing_period.charAt(0).toUpperCase() +
                            founder.billing_period.slice(1)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-iron/70">
                        ${(founder.monthly_credit_cents / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
