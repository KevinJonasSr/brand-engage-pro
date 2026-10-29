import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAPSED_NUDGE_KIND,
  activityBucket,
  groupFollows,
  lapsedDedupKey,
  latestActivityByMember,
  nearestReward,
  recentlyNudgedIds,
  selectLapsedMembers,
} from "./lapsed.ts";

const now = new Date("2026-10-25T23:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY).toISOString();

function member(id: string, extra: Partial<Parameters<typeof selectLapsedMembers>[0]["members"][number]> = {}) {
  return {
    id,
    email: `${id}@example.com`,
    first_name: id,
    unsubscribe_token: `tok-${id}`,
    last_active_date: null,
    ...extra,
  };
}

describe("latestActivityByMember", () => {
  it("keeps the newest timestamp per member across signals", () => {
    const latest = latestActivityByMember([
      { member_id: "a", at: daysAgo(20) },
      { member_id: "a", at: daysAgo(3) },
      { member_id: "a", at: daysAgo(40) },
      { member_id: "b", at: "2026-10-01" },
      { member_id: "", at: daysAgo(1) },
      { member_id: "c", at: "not a date" },
    ]);
    assert.equal(latest.get("a"), Date.parse(daysAgo(3)));
    assert.equal(latest.get("b"), Date.parse("2026-10-01T00:00:00Z"));
    assert.equal(latest.has("c"), false);
    assert.equal(latest.size, 2);
  });
});

describe("activityBucket", () => {
  it("is inclusive at 14 and 30 days", () => {
    assert.equal(activityBucket(Date.parse(daysAgo(13)), now), "active");
    assert.equal(activityBucket(Date.parse(daysAgo(14)), now), "lapsed");
    assert.equal(activityBucket(Date.parse(daysAgo(22)), now), "lapsed");
    assert.equal(activityBucket(Date.parse(daysAgo(30)), now), "lapsed");
    assert.equal(activityBucket(Date.parse(daysAgo(31)), now), "dormant");
    assert.equal(activityBucket(Date.parse(daysAgo(0)), now), "active");
    assert.equal(activityBucket(null, now), "unknown");
  });
});

describe("selectLapsedMembers", () => {
  const follows = new Map<string, string[]>([
    ["active", ["raelynn"]],
    ["lapsed14", ["raelynn"]],
    ["lapsed30", ["bailee", "raelynn"]],
    ["dormant", ["raelynn"]],
    ["nofollow", []],
    ["nudged", ["raelynn"]],
    ["optout", ["raelynn"]],
    ["notoken", ["raelynn"]],
    ["noemail", ["raelynn"]],
    ["silent", ["raelynn"]],
    ["dateonly", ["raelynn"]],
  ]);
  const lastActivity = latestActivityByMember([
    { member_id: "active", at: daysAgo(2) },
    { member_id: "lapsed14", at: daysAgo(14) },
    { member_id: "lapsed30", at: daysAgo(30) },
    { member_id: "dormant", at: daysAgo(45) },
    { member_id: "nofollow", at: daysAgo(20) },
    { member_id: "nudged", at: daysAgo(20) },
    { member_id: "optout", at: daysAgo(20) },
    { member_id: "notoken", at: daysAgo(20) },
    { member_id: "noemail", at: daysAgo(20) },
  ]);
  const members = [
    member("active"),
    member("lapsed14"),
    member("lapsed30"),
    member("dormant"),
    member("nofollow"),
    member("nudged"),
    member("optout"),
    member("notoken", { unsubscribe_token: null }),
    member("noemail", { email: null }),
    member("silent"),
    // Only members.last_active_date says anything about this one.
    member("dateonly", { last_active_date: daysAgo(18).slice(0, 10) }),
  ];

  it("keeps 14–30 day members with a follow, email and token, and nothing else", () => {
    const out = selectLapsedMembers({
      members,
      lastActivity,
      followedSlugsByMember: follows,
      recentlyNudged: new Set(["nudged"]),
      digestOptOut: new Set(["optout"]),
      now,
    });
    assert.deepEqual(
      out.map((c) => c.id),
      ["lapsed14", "lapsed30", "dateonly"],
    );
    const l30 = out.find((c) => c.id === "lapsed30");
    assert.deepEqual(l30?.followedSlugs, ["bailee", "raelynn"]);
    assert.equal(l30?.daysSinceActivity, 30);
    assert.equal(l30?.email, "lapsed30@example.com");
    assert.equal(l30?.unsubscribeToken, "tok-lapsed30");
  });

  it("uses last_active_date when it is newer than the signal tables", () => {
    const out = selectLapsedMembers({
      members: [member("x", { last_active_date: daysAgo(5).slice(0, 10) })],
      lastActivity: latestActivityByMember([{ member_id: "x", at: daysAgo(20) }]),
      followedSlugsByMember: new Map([["x", ["raelynn"]]]),
      recentlyNudged: new Set(),
      now,
    });
    assert.deepEqual(out, []);
  });

  it("falls back to 'there' for a blank first name", () => {
    const out = selectLapsedMembers({
      members: [member("x", { first_name: "  " })],
      lastActivity: latestActivityByMember([{ member_id: "x", at: daysAgo(20) }]),
      followedSlugsByMember: new Map([["x", ["raelynn"]]]),
      recentlyNudged: new Set(),
      now,
    });
    assert.equal(out[0]?.firstName, "there");
  });
});

describe("idempotency", () => {
  it("recentlyNudgedIds keeps members nudged inside 30 days and drops older rows", () => {
    const ids = recentlyNudgedIds(
      [
        { member_id: "fresh", created_at: daysAgo(29) },
        { member_id: "edge", created_at: daysAgo(30) },
        { member_id: "old", created_at: daysAgo(31) },
        { member_id: "bad", created_at: null },
      ],
      now,
    );
    assert.deepEqual([...ids].sort(), ["edge", "fresh"]);
  });

  it("dedup key is one per member per day", () => {
    assert.equal(lapsedDedupKey(now), `${LAPSED_NUDGE_KIND}:2026-10-25`);
    assert.equal(LAPSED_NUDGE_KIND, "lapsed_nudge");
  });
});

describe("groupFollows", () => {
  it("groups slugs per member in order, without duplicates", () => {
    const g = groupFollows([
      { member_id: "a", brand_slug: "raelynn" },
      { member_id: "b", brand_slug: "bailee" },
      { member_id: "a", brand_slug: "bailee" },
      { member_id: "a", brand_slug: "raelynn" },
      { member_id: "", brand_slug: "raelynn" },
    ]);
    assert.deepEqual(g.get("a"), ["raelynn", "bailee"]);
    assert.deepEqual(g.get("b"), ["bailee"]);
    assert.equal(g.size, 2);
  });
});

describe("nearestReward", () => {
  const rewards = [
    { id: "1", title: "Sticker", point_cost: 200, community_id: "raelynn" },
    { id: "2", title: "Tee", point_cost: 1000, community_id: "raelynn" },
    { id: "3", title: "Meet & greet", point_cost: 5000, community_id: "raelynn" },
  ];

  it("names the priciest affordable reward", () => {
    const n = nearestReward(rewards, 1083);
    assert.equal(n?.reward.id, "2");
    assert.equal(n?.affordability.known && n.affordability.canAfford, true);
  });

  it("names the smallest shortfall when nothing is affordable", () => {
    const n = nearestReward(rewards, 150);
    assert.equal(n?.reward.id, "1");
    assert.equal(n?.affordability.known && !n.affordability.canAfford && n.affordability.shortfall, 50);
  });

  it("returns null with no rewards or an unknown balance", () => {
    assert.equal(nearestReward([], 500), null);
    assert.equal(nearestReward(rewards, null), null);
  });
});
