import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import {
  initializeCommunityAction,
  assignOwnerAction,
  setCommunityActiveAction,
} from "./actions";

export const dynamic = "force-dynamic";

type LaunchStatus = {
  slug: string;
  displayName: string;
  active: boolean;
  hasBrand: boolean;
  hasHero: boolean;
  rewardsCount: number;
  goalsCount: number;
  hasWelcomePost: boolean;
  owners: string[];
  memberCount: number;
};

async function gatherLaunchStatus(): Promise<LaunchStatus[]> {
  const admin = createAdminClient();
  const { data: communities } = await admin
    .from("communities")
    .select("slug, display_name, active, hero_image")
    .order("sort_order");

  const out: LaunchStatus[] = [];
  for (const c of communities ?? []) {
    const slug = c.slug as string;
    const [brand, rewards, goals, welcome, owners, members] =
      await Promise.all([
        admin.from("brands").select("slug").eq("slug", slug).maybeSingle(),
        admin
          .from("rewards_catalog")
          .select("id", { count: "exact", head: true })
          .eq("community_id", slug),
        admin
          .from("brand_goals")
          .select("id", { count: "exact", head: true })
          .eq("community_id", slug),
        admin
          .from("community_posts")
          .select("id")
          .eq("brand_slug", slug)
          .eq("kind", "announcement")
          .limit(1),
        admin
          .from("admin_users")
          .select("user_id")
          .eq("community_id", slug)
          .eq("role", "owner"),
        admin
          .from("member_community_memberships")
          .select("member_id", { count: "exact", head: true })
          .eq("community_id", slug),
      ]);

    // Resolve owner display via members table
    let ownerNames: string[] = [];
    const ownerIds = (owners.data ?? []).map((o) => o.user_id as string);
    if (ownerIds.length > 0) {
      const { data: people } = await admin
        .from("members")
        .select("id, email, handle, first_name, last_name")
        .in("id", ownerIds);
      ownerNames = (people ?? []).map(
        (m) =>
          (m.handle as string | null) ||
          [m.first_name, m.last_name].filter(Boolean).join(" ") ||
          (m.email as string | null) ||
          "unknown",
      );
    }

    out.push({
      slug,
      displayName: c.display_name as string,
      active: Boolean(c.active),
      hasBrand: Boolean(brand.data),
      hasHero: Boolean(c.hero_image),
      rewardsCount: rewards.count ?? 0,
      goalsCount: goals.count ?? 0,
      hasWelcomePost: (welcome.data ?? []).length > 0,
      owners: ownerNames,
      memberCount: members.count ?? 0,
    });
  }
  return out;
}

export default async function AdminLaunchPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/launch");
  if (!ctx.isSuperAdmin) redirect("/admin");

  const statuses = await gatherLaunchStatus();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Brand launch</h1>
        <p className="mt-2 text-sm text-white/60">
          Guided checklist for taking a brand community live. Super-admin
          only. A brand goes live when it has a brand page, at least one
          reward, a welcome post, and an owner.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-lg font-semibold text-white">Start a new brand</h2>
        <form
          action={initializeCommunityAction}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-white/50">
            Slug
            <input
              name="slug"
              required
              placeholder="nellies"
              className="w-48 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/50">
            Display name
            <input
              name="display_name"
              required
              placeholder="Nellie's Southern Kitchen"
              className="w-64 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white"
          >
            Create (hidden)
          </button>
        </form>
        <p className="mt-3 text-xs text-white/40">
          Creates the community row inactive. Add the brand page, rewards, and
          a welcome announcement, then flip it live below.
        </p>
      </section>

      <div className="space-y-6">
        {statuses.map((s) => {
          const readyToLaunch =
            s.hasBrand &&
            s.rewardsCount > 0 &&
            s.hasWelcomePost &&
            s.owners.length > 0;
          return (
            <section
              key={s.slug}
              className="rounded-2xl border border-white/10 bg-black/30 p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {s.displayName}
                    <span className="ml-2 text-xs text-white/40">
                      /{s.slug}
                    </span>
                  </h3>
                  <p className="mt-1 text-xs text-white/50">
                    {s.memberCount.toLocaleString()} member
                    {s.memberCount === 1 ? "" : "s"}
                    {s.owners.length > 0 &&
                      ` · Owner: ${s.owners.join(", ")}`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    s.active
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/10 text-white/50"
                  }`}
                >
                  {s.active ? "LIVE" : "HIDDEN"}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <Check ok={s.hasBrand} label="Brand page created" />
                <Check ok={s.hasHero} label="Hero image set" />
                <Check
                  ok={s.rewardsCount > 0}
                  label={`Rewards in catalog (${s.rewardsCount})`}
                />
                <Check
                  ok={s.goalsCount > 0}
                  label={`Community goals (${s.goalsCount}) — optional`}
                />
                <Check ok={s.hasWelcomePost} label="Welcome announcement" />
                <Check ok={s.owners.length > 0} label="Owner assigned" />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <form
                  action={assignOwnerAction}
                  className="flex items-end gap-2"
                >
                  <input type="hidden" name="community_id" value={s.slug} />
                  <label className="flex flex-col gap-1 text-xs text-white/50">
                    Assign owner by email
                    <input
                      type="email"
                      name="email"
                      placeholder="owner@brand.com"
                      className="w-56 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:text-white"
                  >
                    Assign
                  </button>
                </form>

                <form action={setCommunityActiveAction}>
                  <input type="hidden" name="community_id" value={s.slug} />
                  <input
                    type="hidden"
                    name="active"
                    value={s.active ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    disabled={!s.active && !readyToLaunch}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                      s.active
                        ? "border border-white/15 text-white/70 hover:text-white"
                        : readyToLaunch
                          ? "bg-gradient-to-r from-aurora to-ember text-white"
                          : "cursor-not-allowed bg-white/5 text-white/30"
                    }`}
                  >
                    {s.active
                      ? "Take offline"
                      : readyToLaunch
                        ? "Go live 🚀"
                        : "Complete checklist to launch"}
                  </button>
                </form>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={ok ? "text-emerald-300/90" : "text-white/40"}>
      <span className="mr-2">{ok ? "✓" : "○"}</span>
      {label}
    </p>
  );
}
