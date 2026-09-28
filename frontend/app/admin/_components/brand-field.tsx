import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";

/**
 * Brand field for admin create forms.
 * - Super-admins get a required select of every brand, preselected to the
 *   brand chosen in the community switcher (if any).
 * - Brand admins get a hidden field with their own brand. The server
 *   action ignores the browser and re-checks this anyway.
 */
export default async function BrandField({
  name = "community_id",
  className = "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm",
}: {
  name?: string;
  className?: string;
}) {
  const ctx = await getAdminContext();
  if (!ctx) return null;

  if (!ctx.isSuperAdmin) {
    return (
      <input type="hidden" name={name} value={ctx.currentCommunityId ?? ""} />
    );
  }

  let slugs: Array<{ slug: string; display_name: string | null }> = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("communities")
      .select("slug, display_name")
      .order("slug");
    slugs = (data ?? []) as typeof slugs;
  } catch {
    slugs = [];
  }

  return (
    <select
      name={name}
      required
      defaultValue={ctx.currentCommunityId ?? ""}
      className={className}
      aria-label="Brand"
    >
      <option value="" disabled>
        Pick a brand
      </option>
      {slugs.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.display_name ?? c.slug}
        </option>
      ))}
    </select>
  );
}
