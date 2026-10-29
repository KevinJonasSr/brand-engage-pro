import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SCORE_WEIGHTS, aggregateScores, gatherBrandLeaderboard } from "./gather.ts";

/**
 * Local query-builder fake. Unlike lib/points/fake-supabase.test-helper.ts
 * it accepts any chained method (gather uses `in`, `gte`, `lt`) via a Proxy
 * and records the first call as the op plus every filter as (name, args).
 */
type Call = { table: string; op: string; args: unknown[]; filters: Array<[string, unknown[]]> };

function proxySupabase(
  respond: (call: Call) => { data?: unknown; error?: { message: string } | null },
) {
  const calls: Call[] = [];
  function builder(table: string) {
    const call: Call = { table, op: "", args: [], filters: [] };
    const target: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(target, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
            calls.push(call);
            try {
              resolve(respond(call));
            } catch (e) {
              reject(e);
            }
          };
        }
        return (...args: unknown[]) => {
          if (!call.op) {
            call.op = prop;
            call.args = args;
          } else {
            call.filters.push([prop, args]);
          }
          return proxy;
        };
      },
    });
    return proxy;
  }
  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, calls };
}

describe("leaderboard weights", () => {
  it("visits outrank every other activity; the V1 order below them is kept", () => {
    const { visit, redemption, rsvp, comment, reaction } = SCORE_WEIGHTS;
    assert.ok(visit > redemption, "a visit beats a redemption");
    assert.ok(redemption > rsvp);
    assert.ok(rsvp > comment);
    assert.ok(comment > reaction);
    assert.equal(reaction, 1);
  });

  it("aggregateScores bumps the visits count and score per check-in row", () => {
    const scores = aggregateScores({
      visits: ["m1", "m1", "m2", null],
      reactions: ["m2", "m2"],
      comments: ["m1"],
    });
    assert.deepEqual(scores.get("m1"), {
      visits: 2,
      reactions: 0,
      comments: 1,
      rsvps: 0,
      redemptions: 0,
      score: 2 * SCORE_WEIGHTS.visit + SCORE_WEIGHTS.comment,
    });
    assert.deepEqual(scores.get("m2"), {
      visits: 1,
      reactions: 2,
      comments: 0,
      rsvps: 0,
      redemptions: 0,
      score: SCORE_WEIGHTS.visit + 2 * SCORE_WEIGHTS.reaction,
    });
    assert.equal(scores.size, 2, "null member ids are skipped");
  });
});

describe("gatherBrandLeaderboard counts visits", () => {
  const monthStart = new Date("2026-10-01T00:00:00Z");

  it("a weekly regular with no feed activity beats a reaction tapper", async () => {
    const { client, calls } = proxySupabase((call) => {
      switch (call.table) {
        case "brands":
          return { data: { name: "Nellie's", slug: "nellies" }, error: null };
        case "community_posts":
          return { data: [{ id: "p1" }], error: null };
        case "brand_events":
          return { data: [], error: null };
        case "checkins":
          // Four Saturday dinners this month.
          return { data: [1, 2, 3, 4].map(() => ({ member_id: "regular" })), error: null };
        case "community_reactions":
          // Thirty taps on one post.
          return { data: Array.from({ length: 30 }, () => ({ member_id: "tapper" })), error: null };
        case "community_comments":
          return { data: [], error: null };
        case "reward_redemptions":
          return { data: [], error: null };
        case "members":
          return {
            data: [
              { id: "regular", first_name: "Rae", last_name: null, avatar_url: null, current_tier: null, is_test: false },
              { id: "tapper", first_name: "Tap", last_name: null, avatar_url: null, current_tier: null, is_test: false },
            ],
            error: null,
          };
        default:
          return { data: [], error: null };
      }
    });

    const board = await gatherBrandLeaderboard({
      brandSlug: "nellies",
      viewerMemberId: "tapper",
      monthStart,
      admin: client,
    });
    assert.ok(board);
    assert.equal(board.brandName, "Nellie's");
    assert.deepEqual(
      board.top.map((e) => [e.rank, e.member_id, e.score, e.visits, e.reactions]),
      [
        [1, "regular", 4 * SCORE_WEIGHTS.visit, 4, 0],
        [2, "tapper", 30 * SCORE_WEIGHTS.reaction, 0, 30],
      ],
    );
    assert.equal(board.viewerEntry?.rank, 2);
    assert.equal(board.viewerEntry?.visits, 0);

    // The visits query is scoped to this brand and this month.
    const visits = calls.find((c) => c.table === "checkins");
    assert.ok(visits);
    assert.deepEqual(visits.args, ["member_id"]);
    assert.deepEqual(visits.filters, [
      ["eq", ["brand_slug", "nellies"]],
      ["gte", ["created_at", "2026-10-01T00:00:00.000Z"]],
      ["lt", ["created_at", "2026-11-01T00:00:00.000Z"]],
    ]);
  });

  it("a brand with no activity at all returns the empty board", async () => {
    const { client } = proxySupabase((call) =>
      call.table === "brands" ? { data: null, error: null } : { data: [], error: null },
    );
    const board = await gatherBrandLeaderboard({ brandSlug: "ghost", monthStart, admin: client });
    assert.ok(board);
    assert.equal(board.top.length, 0);
    assert.equal(board.totalMembers, 0);
    assert.equal(board.brandName, "ghost");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe as describe2, it as it2 } from "node:test";
import assert2 from "node:assert/strict";

describe2("leaderboard RSVP window", () => {
  it2("filters event_rsvps by rsvp_at (the table has no created_at)", () => {
    const src = readFileSync(fileURLToPath(new URL("./gather.ts", import.meta.url)), "utf8");
    const block = src.slice(src.indexOf('from("event_rsvps")'), src.indexOf('from("reward_redemptions")'));
    assert2.match(block, /\.gte\("rsvp_at"/);
    assert2.doesNotMatch(block, /"created_at"/);
  });
});
