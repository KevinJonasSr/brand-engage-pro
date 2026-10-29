import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandPhrase, buildLapsedEmail, lapsedSubject, rewardSentence } from "./lapsed-email.ts";
import { nearestReward } from "./lapsed.ts";

const base = {
  firstName: "Kevin",
  brands: [
    { slug: "raelynn", name: "RaeLynn" },
    { slug: "bailee", name: "Bailee" },
    { slug: "third", name: "Third Brand" },
  ],
  pointsBalance: 1083,
  nearest: null,
  postalAddress: "123 Music Row, Nashville, TN",
  unsubscribeHref: "https://www.brandengagepro.com/unsubscribe?token=abc&channel=email",
  baseHref: "https://www.brandengagepro.com",
};

describe("lapsedSubject / brandPhrase / rewardSentence", () => {
  it("builds a brand-neutral subject with the first name", () => {
    assert.equal(lapsedSubject("Kevin"), "It's been a minute, Kevin");
    assert.equal(lapsedSubject("  "), "It's been a minute, there");
    assert.equal(lapsedSubject("*|EMAIL|*").includes("*|"), false);
  });

  it("names at most two brands", () => {
    assert.equal(brandPhrase([]), "");
    assert.equal(brandPhrase([{ slug: "a", name: "RaeLynn" }]), "RaeLynn");
    assert.equal(brandPhrase(base.brands), "RaeLynn and Bailee");
  });

  it("describes an affordable reward and a shortfall", () => {
    const rewards = [
      { id: "1", title: "Signed poster", point_cost: 1000, community_id: "raelynn" },
      { id: "2", title: "Meet & greet", point_cost: 5000, community_id: "raelynn" },
    ];
    assert.equal(
      rewardSentence(nearestReward(rewards, 1083)),
      "That's enough to redeem Signed poster (1,000 points) right now.",
    );
    assert.equal(
      rewardSentence(nearestReward(rewards, 800)),
      "You're only 200 points away from Signed poster (1,000 points).",
    );
    assert.equal(rewardSentence(null), "");
  });
});

describe("buildLapsedEmail", () => {
  it("renders the points balance, two brand names, the CTA and unsubscribe", () => {
    const out = buildLapsedEmail(base);
    assert.equal(out.subject, "It's been a minute, Kevin");
    assert.match(out.text, /You still have 1,083 points\./);
    assert.match(out.html, /<b[^>]*>1,083 points<\/b>/);
    assert.match(out.text, /RaeLynn and Bailee have kept going/);
    assert.equal(out.html.includes("Third Brand"), false);
    assert.equal(out.ctaPath, "/brands/raelynn");
    assert.equal(out.ctaHref, "https://www.brandengagepro.com/brands/raelynn");
    assert.match(out.html, /href="https:\/\/www\.brandengagepro\.com\/brands\/raelynn"/);
    assert.match(out.html, /Visit RaeLynn/);
    assert.match(out.html, /href="https:\/\/www\.brandengagepro\.com\/unsubscribe\?token=abc&amp;channel=email"/);
    assert.match(out.text, /Unsubscribe: https:\/\/www\.brandengagepro\.com\/unsubscribe\?token=abc&channel=email/);
    assert.match(out.html, /123 Music Row, Nashville, TN/);
  });

  it("includes the reward line when one is given", () => {
    const nearest = nearestReward(
      [{ id: "1", title: "Tee", point_cost: 1000, community_id: "raelynn" }],
      1083,
    );
    const out = buildLapsedEmail({ ...base, nearest });
    assert.match(out.text, /enough to redeem Tee \(1,000 points\)/);
    assert.match(out.html, /enough to redeem Tee \(1,000 points\)/);
  });

  it("stays generic when every brand is muted and escapes HTML in names", () => {
    const out = buildLapsedEmail({
      ...base,
      firstName: "<Kev>",
      brands: [],
      pointsBalance: 0,
    });
    assert.match(out.text, /Your brands kept going while you were away\. You still have 0 points\./);
    assert.equal(out.ctaPath, "/");
    assert.equal(out.ctaHref, "https://www.brandengagepro.com");
    assert.match(out.html, /Hey &lt;Kev&gt;, it&rsquo;s been a minute/);
    assert.equal(out.html.includes("<Kev>"), false);
  });

  it("uses singular 'has' for one brand", () => {
    const out = buildLapsedEmail({ ...base, brands: [base.brands[0]] });
    assert.match(out.text, /RaeLynn has kept going/);
  });
});
