import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { awardPoints } from "./award.ts";
import { fakeSupabase } from "./fake-supabase.test-helper.ts";

describe("awardPoints", () => {
  it("writes the ledger row, moves totals atomically, reports awarded", async () => {
    const { client, calls, rpcs } = fakeSupabase(() => ({ data: null, error: null }));
    const res = await awardPoints(client, {
      memberId: "m1",
      delta: 25,
      source: "daily_checkin",
      sourceRef: "checkin:nellies:m1:2026-10-29",
      communityId: "nellies",
    });
    assert.deepEqual(res, { awarded: true, delta: 25, communityId: "nellies" });
    const ledger = calls.find((c) => c.table === "points_ledger");
    assert.ok(ledger);
    assert.equal(ledger.op, "insert");
    assert.deepEqual(ledger.args[0], {
      member_id: "m1",
      delta: 25,
      source: "daily_checkin",
      community_id: "nellies",
      source_ref: "checkin:nellies:m1:2026-10-29",
    });
    assert.deepEqual(rpcs, [
      { fn: "add_member_points", args: { p_member_id: "m1", p_delta: 25, p_community_id: "nellies" } },
    ]);
    // No direct total_points read-then-write anywhere.
    assert.ok(!calls.some((c) => c.table === "members" || c.table === "member_community_memberships"));
  });

  it("is idempotent: a duplicate source_ref (23505) moves nothing", async () => {
    const { client, rpcs } = fakeSupabase((call) =>
      call.table === "points_ledger"
        ? { data: null, error: { code: "23505", message: "duplicate" } }
        : { data: null, error: null },
    );
    const res = await awardPoints(client, {
      memberId: "m1",
      delta: 25,
      source: "daily_checkin",
      sourceRef: "checkin:nellies:m1:2026-10-29",
      communityId: "nellies",
    });
    assert.deepEqual(res, { awarded: false, delta: 0, communityId: "nellies" });
    assert.equal(rpcs.length, 0);
  });

  it("resolves the community from a single membership when omitted", async () => {
    const { client, rpcs } = fakeSupabase((call) =>
      call.table === "member_community_memberships"
        ? { data: [{ community_id: "jge" }], error: null }
        : { data: null, error: null },
    );
    const res = await awardPoints(client, { memberId: "m1", delta: 5, source: "daily_checkin" });
    assert.equal(res.communityId, "jge");
    assert.equal((rpcs[0].args as { p_community_id: string }).p_community_id, "jge");
  });

  it("uses the primary membership (earliest joined_at) when omitted", async () => {
    const { client, calls } = fakeSupabase((call) =>
      call.table === "member_community_memberships"
        ? { data: [{ community_id: "jonas-group-ent", joined_at: "2026-01-01" }], error: null }
        : { data: null, error: null },
    );
    const res = await awardPoints(client, { memberId: "m1", delta: 5, source: "daily_checkin" });
    assert.equal(res.communityId, "jonas-group-ent");
    const lookup = calls.find((c) => c.table === "member_community_memberships");
    assert.ok(lookup);
    assert.ok(lookup.chain.includes("order"));
    assert.ok(lookup.chain.includes("limit"));
  });

  it("writes an unscoped ledger row (community_id null) when the member has no membership", async () => {
    const { client, calls, rpcs } = fakeSupabase((call) =>
      call.table === "member_community_memberships"
        ? { data: [], error: null }
        : { data: null, error: null },
    );
    const res = await awardPoints(client, { memberId: "m1", delta: 5, source: "daily_checkin" });
    assert.deepEqual(res, { awarded: true, delta: 5, communityId: null });
    const ledger = calls.find((c) => c.table === "points_ledger");
    assert.ok(ledger);
    assert.equal((ledger.args[0] as { community_id: unknown }).community_id, null);
    assert.equal((rpcs[0].args as { p_community_id: unknown }).p_community_id, null);
  });
});
