import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canSendBlasts } from "./blast-permissions.ts";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("canSendBlasts", () => {
  it("allows a brand owner and a super-admin", () => {
    assert.equal(canSendBlasts({ role: "owner" }), true);
    assert.equal(canSendBlasts({ role: "viewer", isSuperAdmin: true }), true);
  });

  it("refuses admin, editor and viewer", () => {
    assert.equal(canSendBlasts({ role: "admin" }), false);
    assert.equal(canSendBlasts({ role: "editor" }), false);
    assert.equal(canSendBlasts({ role: "viewer" }), false);
    assert.equal(canSendBlasts(null), false);
    assert.equal(canSendBlasts({ role: null }), false);
  });
});

describe("blast gates", () => {
  const broadcastAction = read("../app/admin/broadcast/actions.ts");
  const campaignAction = read("../app/admin/campaigns/actions.ts");
  const broadcastPage = read("../app/admin/broadcast/page.tsx");
  const layout = read("../app/admin/layout.tsx");
  const builder = read("../app/admin/campaigns/new/builder.tsx");

  it("checks the owner on the broadcast action and the campaign publish action", () => {
    assert.match(broadcastAction, /canSendBlasts\(ctx\)/);
    assert.match(campaignAction, /canSendBlasts\(ctx\)/);
    assert.match(broadcastAction, /Only the brand owner can send broadcasts/);
  });

  it("hides the send form and the nav link from everyone else", () => {
    assert.match(broadcastPage, /canSendBlasts\(ctx\)/);
    assert.match(broadcastPage, /BroadcastForm/);
    assert.doesNotMatch(broadcastPage, /use client/);
    assert.match(layout, /canSendBlasts\(ctx\)/);
    assert.match(builder, /canBlast/);
  });
});
