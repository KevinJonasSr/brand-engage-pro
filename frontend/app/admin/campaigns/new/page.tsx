import { redirect } from "next/navigation";
import { listBrandsFromDb } from "@/lib/data/brands";
import { canAccessBrand, getAdminContext } from "@/lib/admin";
import CampaignBuilder from "./builder";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/campaigns/new");
  // Only offer brands this admin may publish to.
  const brands = (await listBrandsFromDb()).filter((b) =>
    canAccessBrand(ctx, b.slug),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          New campaign
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Build a multi-surface drop. Fill in only the sections you want — everything else stays empty.
          Hit Publish to member out across community, marketplace, and member CTAs.
        </p>
      </div>
      <CampaignBuilder brands={brands.map((a) => ({ slug: a.slug, name: a.name }))} />
    </div>
  );
}
