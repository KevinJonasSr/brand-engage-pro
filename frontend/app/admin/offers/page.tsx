import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminPageScope } from "@/lib/admin";
import BrandField from "../_components/brand-field";
import type { Offer } from "@/lib/data/types";
import ImageUploader from "@/components/image-uploader";
import { createOfferAction, toggleOfferActiveAction } from "./actions";
import OfferImageEditor from "./offer-image-editor";

async function listAllOffers(): Promise<Offer[]> {
  // Brand admins see only their own brand's offers; super-admins see all.
  const access = await getAdminPageScope();
  if (!access) return [];
  try {
    const admin = createAdminClient();
    let query = admin
      .from("offers")
      .select("*")
      .order("created_at", { ascending: false });
    if (access.scope) query = query.eq("community_id", access.scope);
    const { data } = await query;
    return (data ?? []) as Offer[];
  } catch {
    return [];
  }
}

export default async function AdminOffersPage() {
  const access = await getAdminPageScope();
  const offers = await listAllOffers();
  // Brand admins upload into their own brand. Super-admins use the brand
  // selected in the switcher. Each existing offer also carries its brand.
  const uploadBrand = access?.scope ?? access?.ctx.currentCommunityId ?? undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Offers
          </h1>
          <p className="mt-2 text-sm text-iron/70">
            Active offers appear on the marketplace. Inactive ones are hidden but not deleted.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-iron/10 bg-parchment/30 p-5">
        <h2 className="text-sm uppercase tracking-wide text-iron/70">Add a new offer</h2>
        <form action={createOfferAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <BrandField />
          <input
            name="title"
            placeholder="Limited merch drop"
            required
            className="rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
          />
          <input
            name="slug"
            placeholder="limited-merch-drop"
            required
            className="rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
          />
          <select
            name="category"
            required
            className="rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
            defaultValue="merch"
          >
            <option value="merch">Merch</option>
            <option value="experience">Experience</option>
            <option value="collectible">Collectible</option>
            <option value="digital">Digital</option>
            <option value="ticket">Ticket</option>
          </select>
          <select
            name="min_tier"
            required
            className="rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
            defaultValue="bronze"
          >
            <option value="bronze">Bronze+</option>
            <option value="silver">Silver+</option>
            <option value="gold">Gold+</option>
            <option value="platinum">Platinum</option>
          </select>
          <input
            name="price_points"
            type="number"
            min={0}
            placeholder="Price in points"
            className="rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
          />
          <input
            name="inventory"
            type="number"
            min={0}
            placeholder="Inventory (optional)"
            className="rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            placeholder="Description"
            rows={2}
            className="rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-sm md:col-span-2"
          />
          <div className="md:col-span-2">
            <p className="mb-2 text-xs uppercase tracking-wide text-iron/70">
              Image / ad mat (optional)
            </p>
            <ImageUploader
              bucket="community-uploads"
              name="image_url"
              label="Add image or ad mat"
              brand={uploadBrand}
            />
            <p className="mt-1 text-xs text-iron/70">
              Recommended: landscape, 1200×800 or larger. JPEG, PNG, WebP, or GIF.
            </p>
          </div>
          <button
            type="submit"
            className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-linen md:col-span-2"
          >
            Create offer
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-iron/10">
        <table className="w-full text-sm">
          <thead className="bg-parchment/40 text-left text-xs uppercase tracking-wide text-iron/70">
            <tr>
              <th className="px-4 py-3">Image</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Min tier</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-iron/70">
                  No offers yet — create one above.
                </td>
              </tr>
            )}
            {offers.map((o) => (
              <tr key={o.id} className="border-t border-iron/5 align-top">
                <td className="px-4 py-3">
                  <div className="w-32">
                    <OfferImageEditor
                      offerId={o.id}
                      initialUrl={o.image_url ?? null}
                      brandSlug={
                        (o as Offer & { community_id?: string | null }).community_id ??
                        uploadBrand
                      }
                    />
                  </div>
                </td>
                <td className="px-4 py-3">{o.title}</td>
                <td className="px-4 py-3 capitalize">{o.category}</td>
                <td className="px-4 py-3 capitalize">{o.min_tier}</td>
                <td className="px-4 py-3">
                  {o.price_points
                    ? `${o.price_points} pts`
                    : o.price_cents != null
                      ? `$${(o.price_cents / 100).toFixed(2)}`
                      : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      o.active ? "bg-emerald-500/20 text-sage-ink" : "bg-iron/10 text-iron/70"
                    }`}
                  >
                    {o.active ? "active" : "hidden"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleOfferActiveAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="active" value={String(!o.active)} />
                    <button className="text-xs text-iron/70 hover:text-iron">
                      {o.active ? "Hide" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
