import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminPageScope } from "@/lib/admin";

type MemberRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  current_tier: string;
  total_points: number;
  created_at: string;
};

type MembershipRow = {
  total_points: number | null;
  current_tier: string | null;
  joined_at: string;
  members: { id: string; email: string | null; first_name: string | null } | null;
};

async function listTopMembers(limit = 50): Promise<MemberRow[]> {
  const access = await getAdminPageScope();
  if (!access) return [];
  try {
    const admin = createAdminClient();
    if (access.scope) {
      // Brand admins see only members of their own brand, ranked by the
      // points they earned in that brand.
      const { data } = await admin
        .from("member_community_memberships")
        .select(
          "total_points,current_tier,joined_at,members!inner(id,email,first_name)",
        )
        .eq("community_id", access.scope)
        .order("total_points", { ascending: false })
        .limit(limit);
      return ((data ?? []) as unknown as MembershipRow[])
        .filter((m) => m.members)
        .map((m) => ({
          id: m.members!.id,
          email: m.members!.email,
          first_name: m.members!.first_name,
          current_tier: m.current_tier ?? "bronze",
          total_points: m.total_points ?? 0,
          created_at: m.joined_at,
        }));
    }
    const { data } = await admin
      .from("members")
      .select("id,email,first_name,current_tier,total_points,created_at")
      .order("total_points", { ascending: false })
      .limit(limit);
    return (data ?? []) as MemberRow[];
  } catch {
    return [];
  }
}

export default async function AdminMembersPage() {
  const members = await listTopMembers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Members
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Top {members.length} members by total points. Read-only for now — edits happen via Supabase
          directly.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-left text-xs uppercase tracking-wide text-white/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3 text-right">Points</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-white/50">
                  No members yet.
                </td>
              </tr>
            )}
            {members.map((f) => (
              <tr key={f.id} className="border-t border-white/5">
                <td className="px-4 py-3">{f.first_name ?? "—"}</td>
                <td className="px-4 py-3">{f.email ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{f.current_tier}</td>
                <td className="px-4 py-3 text-right">
                  {new Intl.NumberFormat("en-US").format(f.total_points)}
                </td>
                <td className="px-4 py-3 text-white/60">
                  {new Date(f.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
