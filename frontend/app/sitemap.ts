import type { MetadataRoute } from "next";
import { listBrandsFromDb } from "@/lib/data/brands";
import { resolveAppUrl } from "@/lib/site-url";

const appUrl = resolveAppUrl();

// Dynamic sitemap — lists the public, crawlable surfaces of Brand Engage Pro:
// marketing root, every active brand page, and the legal pages. We omit
// anything auth-gated (admin, /inbox) and anything that would require a
// session to be meaningful (rewards, marketplace, referrals).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    {
      url: `${appUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${appUrl}/events`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${appUrl}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${appUrl}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${appUrl}/cookie-policy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  try {
    const brands = await listBrandsFromDb();
    for (const a of brands) {
      base.push({
        url: `${appUrl}/brands/${a.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // Silently skip brand pages if the DB fetch errors — we still want a
    // working sitemap for crawlers.
  }

  return base;
}
