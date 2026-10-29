import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Image from "next/image";
import RedemptionAction from "./redemption-action";
import { listPendingRedemptions } from "@/lib/data/rewards";
import CodeSearch from "./[code]/code-search";

export const dynamic = "force-dynamic";

export default async function AdminRedemptionsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/redemptions");

  const pending = await listPendingRedemptions(ctx.currentCommunityId || "");

  // Get member details for pending redemptions
  const supabase = createAdminClient();
  const memberIds = pending.map((p) => p.member_id);
  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name, avatar_url")
    .in("id", memberIds);

  const memberMap = new Map(members?.map((f) => [f.id, f]) ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Redemption Queue</h1>
        <div className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-semibold text-aurora-ink">
          {pending.length} pending
        </div>
      </div>

      {/* Counter lookup: type or paste a member's code to jump straight to
          /admin/redemptions/[code] without scrolling the queue. */}
      <section className="glass-card rounded-lg p-4">
        <p className="text-xs uppercase tracking-wide text-iron/70">Look up a code</p>
        <div className="mt-2">
          <CodeSearch />
        </div>
      </section>

      {pending.length > 0 ? (
        <div className="glass-card divide-y divide-iron/5 rounded-lg overflow-hidden">
          {pending.map((redemption) => {
            const member = memberMap.get(redemption.member_id);
            return (
              <div
                key={redemption.id}
                className="flex items-center justify-between gap-4 p-4 hover:bg-parchment/20"
              >
                <div className="flex items-center gap-3 flex-1">
                  {member?.avatar_url && (
                    <div className="relative h-10 w-10 overflow-hidden rounded-full">
                      <Image
                        src={member.avatar_url}
                        alt={member.first_name || "Member"}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {member?.first_name || "Member"} · {redemption.reward.title}
                    </p>
                    {redemption.delivery_details && (
                      <p className="mt-1 text-xs text-iron/70">{redemption.delivery_details}</p>
                    )}
                    <p className="mt-1 text-xs text-iron/70">
                      {new Date(redemption.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <RedemptionAction redemptionId={redemption.id} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-lg p-8 text-center">
          <p className="text-iron/70">No pending redemptions. You&apos;re all caught up!</p>
        </div>
      )}
    </div>
  );
}
