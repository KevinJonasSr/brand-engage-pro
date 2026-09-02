import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_PRODUCTION_ORIGIN,
  isForbiddenAppOrigin,
  resolveAppUrl,
  resolvePinnedCanonicalLocation,
} from "./site-url.ts";

const siteUrlSrc = readFileSync(
  fileURLToPath(new URL("./site-url.ts", import.meta.url)),
  "utf8",
);
const layoutSrc = readFileSync(
  fileURLToPath(new URL("../app/layout.tsx", import.meta.url)),
  "utf8",
);
const nextConfigSrc = readFileSync(
  fileURLToPath(new URL("../next.config.ts", import.meta.url)),
  "utf8",
);
const proxySrc = readFileSync(
  fileURLToPath(new URL("../proxy.ts", import.meta.url)),
  "utf8",
);

describe("resolveAppUrl / canonical", () => {
  it("pins the canonical production origin to www", () => {
    assert.equal(CANONICAL_PRODUCTION_ORIGIN, "https://www.brandengagepro.com");
    assert.equal(resolveAppUrl({}), "https://www.brandengagepro.com");
  });

  it("never defaults to $VERCEL_URL or vercel.app", () => {
    assert.doesNotMatch(siteUrlSrc, /process\.env\.VERCEL_URL/);
    assert.doesNotMatch(siteUrlSrc, /env\.VERCEL_URL/);
    assert.equal(
      resolveAppUrl({
        VERCEL_URL: "brand-engage-pro.vercel.app",
        NEXT_PUBLIC_VERCEL_URL: "brand-engage-pro.vercel.app",
      }),
      "https://www.brandengagepro.com",
    );
    assert.equal(
      resolveAppUrl({
        NEXT_PUBLIC_APP_URL: "https://brand-engage-pro.vercel.app",
      }),
      "https://www.brandengagepro.com",
    );
    assert.equal(
      resolveAppUrl({
        NEXT_PUBLIC_SITE_URL: "https://brand-engage-pro-git-preview.vercel.app",
      }),
      "https://www.brandengagepro.com",
    );
  });

  it("does not use apex as a landing or email-redirect host", () => {
    assert.equal(isForbiddenAppOrigin("https://brandengagepro.com"), true);
    assert.equal(
      resolveAppUrl({ NEXT_PUBLIC_APP_URL: "https://brandengagepro.com" }),
      "https://www.brandengagepro.com",
    );
    assert.match(siteUrlSrc, /email redirect/i);
    assert.match(siteUrlSrc, /\$VERCEL_URL/);
    assert.match(siteUrlSrc, /vercel\.app/);
    assert.match(siteUrlSrc, /apex/);
  });

  it("keeps an explicit www APP_URL", () => {
    assert.equal(
      resolveAppUrl({
        NEXT_PUBLIC_APP_URL: "https://www.brandengagepro.com/",
      }),
      "https://www.brandengagepro.com",
    );
  });

  it("pins layout metadata / next.config CORS / proxy to resolveAppUrl or www", () => {
    assert.match(layoutSrc, /resolveAppUrl/);
    assert.doesNotMatch(layoutSrc, /brand-engage-pro\.vercel\.app/);
    assert.match(nextConfigSrc, /resolveAppUrl/);
    assert.match(nextConfigSrc, /FORBIDDEN_LANDING_HOSTS/);
    assert.match(nextConfigSrc, /CANONICAL_PRODUCTION_ORIGIN\}\/:path\*/);
    assert.match(proxySrc, /resolvePinnedCanonicalLocation/);
  });
});

describe("resolvePinnedCanonicalLocation", () => {
  it("308s the production vercel.app alias to www with path and query", () => {
    assert.equal(
      resolvePinnedCanonicalLocation(
        "brand-engage-pro.vercel.app",
        "/login",
        "?next=%2Frewards",
      ),
      "https://www.brandengagepro.com/login?next=%2Frewards",
    );
    assert.equal(
      resolvePinnedCanonicalLocation("brand-engage-pro.vercel.app", "/"),
      "https://www.brandengagepro.com/",
    );
  });

  it("keeps apex → www and does not pin preview vercel.app hosts", () => {
    assert.equal(
      resolvePinnedCanonicalLocation("brandengagepro.com", "/login"),
      "https://www.brandengagepro.com/login",
    );
    assert.equal(
      resolvePinnedCanonicalLocation(
        "brand-engage-pro-git-cursor.vercel.app",
        "/login",
      ),
      null,
    );
    assert.equal(
      resolvePinnedCanonicalLocation("www.brandengagepro.com", "/login"),
      null,
    );
  });

  it("pins the sibling production vercel.app host the same way", () => {
    assert.equal(
      resolvePinnedCanonicalLocation(
        "brand-engage-pro-jonas-group.vercel.app",
        "/brands/nellies",
      ),
      "https://www.brandengagepro.com/brands/nellies",
    );
    assert.match(siteUrlSrc, /brand-engage-pro-jonas-group\.vercel\.app/);
    assert.match(siteUrlSrc, /Dashboard still needed/);
  });
});
