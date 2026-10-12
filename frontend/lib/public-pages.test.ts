import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const forBrands = read("../app/for-brands/page.tsx");
const pricing = read("../app/pricing/page.tsx");
const help = read("../app/help/page.tsx");
const footer = read("../components/footer.tsx");
const checkin = read("../app/brands/[slug]/checkin/page.tsx");

describe("public pricing and help pages", () => {
  it("states founding-brand pricing and links it from for-brands and the footer", () => {
    for (const sentence of [
      "$50 per brand per month after a 30-day free trial.",
      "Our first 10 founding brands join free.",
      "Works with any POS, no Square or Toast required.",
      "check-in rewards, points, and member messaging by email",
    ]) {
      assert.match(pricing, new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(forBrands, /href="\/pricing"/);
    assert.match(forBrands, /What does it cost\?/);
    assert.match(forBrands, /\$50 per brand per month after a 30-day free trial/);
    assert.match(footer, /href="\/pricing"/);
    assert.match(footer, /href="\/help"/);
  });

  it("does not name Claude or Slack on /for-brands and says AI drafts", () => {
    assert.match(forBrands, /AI drafts/);
    assert.doesNotMatch(forBrands, /Claude/);
    assert.doesNotMatch(forBrands, /Slack/);
  });

  it("lists support@brandengagepro.com on /help", () => {
    assert.match(help, /support@brandengagepro\.com/);
    assert.match(help, /How do I check in\?/);
  });
});

describe("signed-out check-in prompt", () => {
  it("shows Sign in and Join back to the same check-in and still posts only after auth", () => {
    assert.match(checkin, /Sign in or join to check in/);
    assert.match(checkin, />\s*Sign in\s*<\/Link>/);
    assert.match(checkin, />\s*Join\s*<\/Link>/);
    assert.match(checkin, /\/login\?next=/);
    assert.match(checkin, /\/signup\?ref=/);
    assert.match(checkin, /next=\$\{encodeURIComponent\(checkinPath\)\}/);
    assert.doesNotMatch(checkin, /One moment/);
    assert.match(checkin, /fetch\("\/api\/checkin"/);
    assert.match(checkin, /status: "unauthenticated"/);
  });
});
