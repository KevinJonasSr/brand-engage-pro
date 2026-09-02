import type { NextConfig } from "next";
import { brandAliasRedirects } from "./lib/brand-aliases";
import {
  CANONICAL_PRODUCTION_ORIGIN,
  FORBIDDEN_LANDING_HOSTS,
  resolveAppUrl,
} from "./lib/site-url";

const authSensitiveHeaders = [
  { key: "Cache-Control", value: "private, no-store, no-cache, max-age=0, must-revalidate, no-transform" },
  { key: "CDN-Cache-Control", value: "no-store" },
  { key: "Vercel-CDN-Cache-Control", value: "no-store" },
];

const authSensitiveRoutes = [
  "/auth/:path*",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/onboarding/:path*",
  "/premium",
  "/premium/:path*",
  "/settings/:path*",
  "/me/:path*",
  "/admin/:path*",
  "/inbox/:path*",
  "/api/stripe/:path*",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "enfpviapxvqyoarwwsuf.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async redirects() {
    // Soft-launch: /join is not a BEP surface (Fan Engage /join is separate).
    // Preserve query string (e.g. ?ref=nellies) so print/QR links still attribute.
    const hostPin = (host: string) => [
      {
        source: "/",
        has: [{ type: "host" as const, value: host }],
        destination: `${CANONICAL_PRODUCTION_ORIGIN}/`,
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        destination: `${CANONICAL_PRODUCTION_ORIGIN}/:path*`,
        permanent: true,
      },
    ];
    return [
      // Production sibling hosts + apex → www. 308.
      // Apex already 308s to www at the edge — keep that. Query is preserved.
      // Do not pin preview *.vercel.app hosts (git-*, *-cursor-*).
      ...FORBIDDEN_LANDING_HOSTS.flatMap((host) => hostPin(host)),
      // JGE aliases → /brands/jonas-group-ent (subpaths preserved).
      ...brandAliasRedirects(),
      {
        source: "/join",
        destination: "/signup",
        permanent: false,
      },
      {
        source: "/join/:path*",
        destination: "/signup",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      ...authSensitiveRoutes.map((source) => ({
        source,
        headers: authSensitiveHeaders,
      })),
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: resolveAppUrl(),
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type,Authorization,X-Requested-With",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src https://challenges.cloudflare.com; frame-ancestors 'none';",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
