import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Sprint 3 track E — source-level guards for small UI/data fixes that have
 * no unit-testable surface of their own.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(new URL(rel, `file://${ROOT}`), "utf8");

describe("brand page essentials (brands 0024)", () => {
  const data = read("lib/data/brands.ts");
  const page = read("app/brands/[slug]/page.tsx");

  it("selects address/hours_json/phone/website_url on every brands-table query", () => {
    const brandSelects = data.match(/\.from\("brands"\)\s*\.select\("([^"]+)"\)/g) ?? [];
    assert.ok(brandSelects.length >= 3, "expected brand-table selects");
    for (const sel of brandSelects) {
      for (const col of ["address", "hours_json", "phone", "website_url"]) {
        assert.match(sel, new RegExp(`\\b${col}\\b`), `${col} missing from ${sel}`);
      }
    }
    // brand_events selects are untouched.
    const eventSelects = data.match(/\.from\("brand_events"\)\s*\.select\("([^"]+)"\)/g) ?? [];
    for (const sel of eventSelects) {
      assert.doesNotMatch(sel, /hours_json|website_url/);
    }
  });

  it("maps the row columns onto the Brand type", () => {
    for (const line of ["address: row.address", "hours: row.hours_json", "phone: row.phone", "websiteUrl: row.website_url"]) {
      assert.ok(data.includes(line), line);
    }
  });

  it("renders a Visit block with maps / hours / tel / website, guarded on presence", () => {
    assert.ok(page.includes('from "@/lib/brand-hours"'));
    assert.ok(page.includes("describeTodayHours(brand.hours)"));
    assert.ok(page.includes("googleMapsSearchUrl(brand.address)"));
    assert.ok(page.includes("telHref(brand.phone)"));
    assert.ok(page.includes("href={brand.websiteUrl}"));
    assert.ok(page.includes("{brand.address &&"));
    assert.ok(page.includes("{todayHours.label &&"));
    assert.ok(page.includes("{brand.phone &&"));
    assert.ok(page.includes("{brand.websiteUrl &&"));
  });

  it("keeps the Sprint 2 Upcoming empty state", () => {
    assert.ok(page.includes("<BrandDirectoryUpcomingEmpty"));
  });
});

describe("/brands card layout", () => {
  const src = read("app/brands/page.tsx");

  it("no longer overlays the follow control over the title", () => {
    assert.doesNotMatch(src, /absolute bottom-5 right-5/);
    assert.doesNotMatch(src, /\bpr-36\b/);
    // The title wraps instead of truncating.
    const h2 = src.slice(src.indexOf("<h2"), src.indexOf("</h2>"));
    assert.doesNotMatch(h2, /\btruncate\b/);
    assert.match(h2, /break-words/);
  });

  it("puts the enter link and follow control in a footer row beneath the poster", () => {
    const footerStart = src.indexOf("Footer row");
    assert.ok(footerStart > 0, "footer comment present");
    const footer = src.slice(footerStart);
    assert.ok(footer.indexOf("Enter member club →") < footer.indexOf("<BrandDirectoryFollow"));
    assert.match(footer, /justify-between/);
    // Footer is a sibling of the poster <Link>, not nested in it.
    const linkClose = src.lastIndexOf("</Link>", footerStart);
    assert.ok(linkClose > 0 && linkClose < footerStart);
  });

  it("keeps the Following chip", () => {
    assert.ok(src.includes("Following\n"));
    assert.ok(src.includes("followed.has(a.slug) && ("));
  });
});

describe("offers community scoping", () => {
  const src = read("lib/data/offers.ts");

  it("uses getCurrentCommunityIdOrNull and returns no offers when unresolved", () => {
    assert.ok(src.includes('import { getCurrentCommunityIdOrNull } from "@/lib/community"'));
    assert.doesNotMatch(src, /\.catch\(\(\) => "nellies"\)/);
    assert.doesNotMatch(src, /\bgetCurrentCommunityId\(/);
    assert.ok(src.includes("if (!communityId) return [];"));
  });
});

describe("admin redemptions queue", () => {
  const src = read("app/admin/redemptions/page.tsx");

  it("mounts the code-search component above the queue", () => {
    assert.ok(src.includes('import CodeSearch from "./[code]/code-search"'));
    assert.ok(src.indexOf("<CodeSearch") < src.indexOf("pending.length > 0 ?"));
  });

  it("code-search still routes to /admin/redemptions/[code]", () => {
    const cs = read("app/admin/redemptions/[code]/code-search.tsx");
    assert.ok(cs.includes("router.push(`/admin/redemptions/${code}`)"));
  });
});

describe("PWA icons", () => {
  const manifest = JSON.parse(read("public/manifest.json")) as {
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  const svgIcons = manifest.icons.filter((i) => i.src.startsWith("/icons/"));

  it("manifest still lists the three SVG icons", () => {
    assert.deepEqual(
      svgIcons.map((i) => i.src).sort(),
      ["/icons/icon-192.svg", "/icons/icon-512.svg", "/icons/icon.svg"],
    );
  });

  it("every SVG uses the header mark (peaks + bar), not the old FE lettering", () => {
    for (const icon of svgIcons) {
      const svg = read(`public${icon.src}`);
      assert.match(svg, /#D4A017/i, `${icon.src} gold stop`);
      assert.match(svg, /#9B2335/i, `${icon.src} burgundy stop`);
      assert.doesNotMatch(svg, /#7c3aed|#f97316/i, `${icon.src} stale colours`);
      assert.doesNotMatch(svg, />FE<\/text>/);
      assert.match(svg, /M6 24 L6 18\.5 L10\.5 22 L16 9/, `${icon.src} peaks path`);
      assert.match(svg, /viewBox="0 0 512 512"/);
      if (icon.sizes !== "any") {
        const px = icon.sizes.split("x")[0];
        assert.match(svg, new RegExp(`<svg[^>]*width="${px}" height="${px}"`), `${icon.src} intrinsic size`);
      }
    }
  });

  it("the maskable icon fills the full canvas", () => {
    const maskable = svgIcons.find((i) => i.purpose?.includes("maskable"))!;
    assert.match(read(`public${maskable.src}`), /<rect width="512" height="512"/);
  });
});
