import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRAND_PREFS_TABLE,
  excludeMutedFollowers,
  getMutedBrandSlugs,
  getMutedMemberIds,
  withoutMuted,
} from "./brand-prefs.ts";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** Minimal stand-in for the supabase query chain the helper uses. */
function fakeClient(
  rows: Array<Record<string, unknown>> | null,
  error: { message: string } | null = null,
) {
  const calls: Array<{ table: string; cols: string; eqs: Array<[string, unknown]> }> = [];
  const client = {
    from(table: string) {
      const call = { table, cols: "", eqs: [] as Array<[string, unknown]> };
      calls.push(call);
      return {
        select(cols: string) {
          call.cols = cols;
          return {
            eq(c1: string, v1: unknown) {
              call.eqs.push([c1, v1]);
              return {
                eq(c2: string, v2: unknown) {
                  call.eqs.push([c2, v2]);
                  return Promise.resolve({ data: rows, error });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("withoutMuted (pure)", () => {
  it("returns a copy when nothing is muted", () => {
    const input = ["a", "b"];
    const out = withoutMuted(input, []);
    assert.deepEqual(out, ["a", "b"]);
    assert.notEqual(out, input);
  });

  it("drops muted ids and keeps order", () => {
    assert.deepEqual(withoutMuted(["a", "b", "c", "d"], ["c", "a"]), ["b", "d"]);
  });

  it("accepts a Set and ignores muted ids that are not followers", () => {
    assert.deepEqual(withoutMuted(["x", "y"], new Set(["y", "zzz"])), ["x"]);
  });

  it("handles an empty follower list", () => {
    assert.deepEqual(withoutMuted([], ["a"]), []);
  });
});

describe("excludeMutedFollowers", () => {
  it("runs exactly one query per call, scoped to brand + muted=true", async () => {
    const { client, calls } = fakeClient([{ member_id: "m2" }]);
    const out = await excludeMutedFollowers(["m1", "m2", "m3"], "nellies", client);
    assert.deepEqual(out, ["m1", "m3"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, BRAND_PREFS_TABLE);
    assert.equal(calls[0].cols, "member_id");
    assert.deepEqual(calls[0].eqs, [
      ["brand_slug", "nellies"],
      ["muted", true],
    ]);
  });

  it("skips the query entirely for an empty follower list", async () => {
    const { client, calls } = fakeClient([{ member_id: "m2" }]);
    const out = await excludeMutedFollowers([], "nellies", client);
    assert.deepEqual(out, []);
    assert.equal(calls.length, 0);
  });

  it("treats null data as no mutes", async () => {
    const { client } = fakeClient(null);
    assert.deepEqual(await excludeMutedFollowers(["m1"], "b", client), ["m1"]);
  });

  it("throws on a query error so the trigger's catch skips the fan-out", async () => {
    const { client } = fakeClient(null, { message: "boom" });
    await assert.rejects(
      () => excludeMutedFollowers(["m1"], "b", client),
      /brand-prefs: boom/,
    );
  });
});

describe("getMutedMemberIds / getMutedBrandSlugs", () => {
  it("returns a Set of member ids", async () => {
    const { client } = fakeClient([{ member_id: "a" }, { member_id: "b" }]);
    const set = await getMutedMemberIds("b", client);
    assert.ok(set instanceof Set);
    assert.deepEqual([...set], ["a", "b"]);
  });

  it("returns brand slugs for a member, filtering on muted=true", async () => {
    const { client, calls } = fakeClient([{ brand_slug: "nellies" }]);
    assert.deepEqual(await getMutedBrandSlugs("member-1", client), ["nellies"]);
    assert.deepEqual(calls[0].eqs, [
      ["member_id", "member-1"],
      ["muted", true],
    ]);
  });
});

// Every trigger that fans out to a brand's audience must run the follower
// list through the mute filter before calling sendNotification.
const FAN_OUT_TRIGGERS = [
  "./triggers/new-post.ts",
  "./triggers/drop.ts",
  "./triggers/prediction.ts",
] as const;

describe("fan-out triggers honor per-brand mute", () => {
  for (const rel of FAN_OUT_TRIGGERS) {
    const src = read(rel);
    describe(rel, () => {
      it("imports excludeMutedFollowers from brand-prefs", () => {
        assert.match(
          src,
          /import \{ excludeMutedFollowers \} from "\.\.\/brand-prefs";/,
        );
      });

      it("filters every fan-out list before sending", () => {
        // One excludeMutedFollowers call per sendNotification fan-out.
        const sends = src.match(/sendNotification\(\{/g)?.length ?? 0;
        const filters = src.match(/await excludeMutedFollowers\(/g)?.length ?? 0;
        assert.ok(sends > 0, "no sendNotification fan-out found");
        assert.equal(filters, sends, `${filters} filters for ${sends} fan-outs`);
      });

      it("passes the brand slug from opts", () => {
        assert.match(src, /excludeMutedFollowers\([\s\S]*?opts\.brandSlug,\s*\)/);
      });
    });
  }

  it("member-scoped triggers do not query the follower table", () => {
    for (const rel of [
      "./triggers/anniversary.ts",
      "./triggers/comment-on-my-post.ts",
      "./triggers/redemption-fulfilled.ts",
      "./triggers/rsvp-confirmation.ts",
    ]) {
      assert.doesNotMatch(read(rel), /member_brand_following/, rel);
    }
  });
});

describe("/me/notifications wiring", () => {
  const prefs = read("../../app/me/notifications/prefs.ts");
  const page = read("../../app/me/notifications/page.tsx");
  const section = read("../../app/me/notifications/brand-mutes.tsx");

  it("setBrandMuted is an inline Server Function that revalidates the page", () => {
    const start = prefs.indexOf("export async function setBrandMuted(");
    assert.ok(start >= 0);
    const body = prefs.slice(start);
    assert.match(body, /^\s*"use server";/m);
    assert.match(body, /\.from\("member_brand_following"\)/);
    assert.match(body, /\.from\("member_brand_notification_prefs"\)/);
    assert.match(body, /onConflict: "member_id,brand_slug"/);
    assert.match(body, /revalidatePath\("\/me\/notifications"\)/);
  });

  it("page renders the Brands section with the action", () => {
    assert.match(page, /<BrandMutes brands=\{followedBrands\} setBrandMuted=\{setBrandMuted\} \/>/);
    assert.match(page, /\.from\("member_brand_notification_prefs"\)/);
  });

  it("section carries the agreed copy", () => {
    assert.match(
      section,
      /Muted brands don't send you posts, drops or predictions\. You'll still get your own RSVP reminders and rewards\./,
    );
  });
});
