import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdminContext,
  getAdminCommunityId,
  roleAtLeast,
  type AdminRole,
} from "@/lib/admin";
import { addTeamMemberAction, removeTeamMemberAction } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  owner: "Full control, including team management. Set by platform staff.",
  admin: "Everything except team management — rewards, posts, goals, members.",
  editor: "Create and edit content — posts, rewards, goals, campaigns.",
  viewer: "Read-only access to analytics and member activity.",
};

type TeamRow = {
  user_id: string;
  role: AdminRole;
  name: string | null;
  email: string | null;
};

export default async function AdminTeamPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/team");
  const canManage = ctx.isSuperAdmin || roleAtLeast(ctx.role, "owner");
  if (!canManage) redirect("/admin");

  const communityId = await getAdminCommunityId();
  const admin = createAdminClient();

  const { data: adminRows } = await admin
    .from("admin_users")
    .select("user_id, role")
    .eq("community_id", communityId)
    .order("role");

  const userIds = (adminRows ?? []).map((r) => r.user_id);
  let team: TeamRow[] = [];
  if (userIds.length > 0) {
    const { data: people } = await admin
      .from("members")
      .select("id, email, handle, first_name, last_name")
      .in("id", userIds);
    const byId = new Map(
      (people ?? []).map((m) => [
        m.id as string,
        {
          name:
            (m.handle as string | null) ||
            [m.first_name, m.last_name].filter(Boolean).join(" ") ||
            null,
          email: (m.email as string | null) ?? null,
        },
      ]),
    );
    const ROLE_ORDER: Record<string, number> = {
      owner: 0,
      admin: 1,
      editor: 2,
      viewer: 3,
    };
    team = (adminRows ?? [])
      .map((r) => ({
        user_id: r.user_id as string,
        role: r.role as AdminRole,
        name: byId.get(r.user_id as string)?.name ?? null,
        email: byId.get(r.user_id as string)?.email ?? null,
      }))
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-white/50">
          {communityId}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">Team</h1>
        <p className="mt-2 text-sm text-white/60">
          Give your staff access to the brand dashboard. They need a Brand
          Engage account first — have them sign up on the member site, then
          add their email here.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {team.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-white/50">
                  No team members yet — add one below.
                </td>
              </tr>
            )}
            {team.map((t) => (
              <tr key={t.user_id} className="border-b border-white/5">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">
                    {t.name ?? t.email ?? t.user_id.slice(0, 8)}
                    {t.user_id === ctx.user.id && (
                      <span className="ml-2 text-xs text-white/40">(you)</span>
                    )}
                  </p>
                  {t.email && <p className="text-xs text-white/40">{t.email}</p>}
                </td>
                <td className="px-4 py-3 capitalize text-white/80">{t.role}</td>
                <td className="px-4 py-3 text-right">
                  {t.user_id !== ctx.user.id &&
                    (t.role !== "owner" || ctx.isSuperAdmin) && (
                      <form action={removeTeamMemberAction}>
                        <input type="hidden" name="user_id" value={t.user_id} />
                        <button
                          type="submit"
                          className="text-xs text-red-300/80 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </form>
                    )}
                  {t.role === "owner" && !ctx.isSuperAdmin && (
                    <span className="text-xs text-white/30">
                      Owners are managed by platform staff
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-lg font-semibold text-white">Add a team member</h2>
        <form
          action={addTeamMemberAction}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-white/50">
            Email
            <input
              type="email"
              name="email"
              required
              placeholder="teammate@brand.com"
              className="w-64 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/50">
            Role
            <select
              name="role"
              defaultValue="editor"
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-purple-500 to-orange-400 px-4 py-2 text-sm font-semibold text-white"
          >
            Add
          </button>
        </form>
        <dl className="mt-6 grid gap-2 text-xs text-white/50 sm:grid-cols-2">
          {(Object.keys(ROLE_DESCRIPTIONS) as AdminRole[]).map((r) => (
            <div key={r}>
              <dt className="font-semibold capitalize text-white/70">{r}</dt>
              <dd>{ROLE_DESCRIPTIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
