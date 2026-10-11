import Link from "next/link";
import { redirect } from "next/navigation";
import { listBrandsForAdmin } from "@/lib/data/brands";
import { canAccessBrand, getAdminContext } from "@/lib/admin";
import CreateBrandForm from "./create-brand-form";

export const dynamic = "force-dynamic";

export default async function AdminBrandsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/brands");
  // Brand admins see only the brands they manage.
  const brands = (await listBrandsForAdmin()).filter((b) =>
    canAccessBrand(ctx, b.slug),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Brands
        </h1>
        <p className="mt-1 text-sm text-iron/70">
          Manage brand pages, hero images, bios, events, and social links — no code deploys required.
        </p>
      </div>

      <section className="space-y-3">
        {brands.length === 0 ? (
          <p className="text-xs text-iron/70">No brands yet.</p>
        ) : (
          brands.map((a) => (
            <Link
              key={a.slug}
              href={`/admin/brands/${a.slug}`}
              className="block rounded-lg border border-iron/10 bg-parchment/30 p-4 transition hover:border-iron/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {a.hero_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.hero_image} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-iron"
                      style={{
                        backgroundImage: `linear-gradient(to bottom right, ${a.accent_from}, ${a.accent_to})`
                      }}
                    >
                      {a.name.slice(0, 1)}
                    </span>
                  )}
                  <div>
                    <p className="text-base font-semibold">{a.name}</p>
                    <p className="text-xs text-iron/70">/{a.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-iron/70">
                  <span>{a.event_count} events</span>
                  <span>{a.follower_count} followers</span>
                  {!a.active && (
                    <span className="rounded-full bg-iron/10 px-2 py-0.5 text-xs uppercase tracking-wide">Inactive</span>
                  )}
                </div>
              </div>
              {a.tagline && <p className="mt-2 text-sm text-iron/70">{a.tagline}</p>}
            </Link>
          ))
        )}
      </section>

      {ctx.isSuperAdmin && (
      <section className="rounded-lg border border-dashed border-iron/15 bg-parchment/20 p-4">
        <p className="text-sm font-semibold">Add a new brand</p>
        <p className="mt-1 text-xs text-iron/70">
          Slug is the URL segment (lowercase letters, digits, dashes). Can&apos;t be changed later.
        </p>
        <CreateBrandForm />
      </section>
      )}
    </div>
  );
}
