import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessBrand, getAdminContext } from "@/lib/admin";
import { hostStandBrandAccess } from "@/lib/checkin-host-stand";
import { createAdminClient } from "@/lib/supabase/admin";
import HostStandScreen from "./host-stand";

export const dynamic = "force-dynamic";

/**
 * /admin/checkin-display?brand=<slug>
 *
 * Tablet page for the rotating check-in QR. Billing lock is enforced here
 * and again on the QR API. The printed poster QR is unchanged.
 */
export default async function CheckinDisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) notFound();

  const { brand: requested } = await searchParams;
  const brandSlug = (requested ?? ctx.currentCommunityId ?? "").trim();

  if (!brandSlug) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Host-stand check-in</h1>
        <p className="text-sm text-iron/70">Pick a brand, then open this screen on the tablet.</p>
        <Link href="/admin/communities" className="text-sm font-semibold underline">
          Choose a brand
        </Link>
      </div>
    );
  }

  if (!canAccessBrand(ctx, brandSlug)) notFound();

  const access = await hostStandBrandAccess(brandSlug);
  if (!access.ok) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Host-stand check-in</h1>
        <p className="max-w-md text-sm text-ember">{access.message}</p>
        {access.status === 403 && (
          <Link href="/admin/billing" className="text-sm font-semibold underline">
            Open billing
          </Link>
        )}
      </div>
    );
  }

  const { data } = await createAdminClient()
    .from("brands")
    .select("name")
    .eq("slug", brandSlug)
    .maybeSingle();

  return <HostStandScreen brandSlug={brandSlug} brandName={data?.name ?? brandSlug} />;
}
