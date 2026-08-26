import type { MetadataRoute } from "next";
import { resolveAppUrl } from "@/lib/site-url";

const appUrl = resolveAppUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/inbox", "/auth/"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
