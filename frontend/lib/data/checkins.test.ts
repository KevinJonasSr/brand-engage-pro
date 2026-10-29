import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL("../../../supabase/migrations/0056_ensure_checkins.sql", import.meta.url),
  ),
  "utf8",
);
const checkinsSrc = readFileSync(
  fileURLToPath(new URL("./checkins.ts", import.meta.url)),
  "utf8",
);
const firstSessionSrc = readFileSync(
  fileURLToPath(new URL("./first-session.ts", import.meta.url)),
  "utf8",
);
const profilePage = readFileSync(
  fileURLToPath(new URL("../../app/profile/page.tsx", import.meta.url)),
  "utf8",
);

describe("public.checkins + /profile door", () => {
  it("ensures the checkins table, grants, and PostgREST reload", () => {
    assert.match(migration, /create table if not exists public\.checkins/);
    assert.match(migration, /grant select, insert on table public\.checkins to authenticated/);
    assert.match(migration, /grant all on table public\.checkins to service_role/);
    assert.match(migration, /notify pgrst, 'reload schema'/);
    assert.match(migration, /Members can insert own checkins/);
    assert.match(checkinsSrc, /from\("checkins"\)/);
    assert.match(firstSessionSrc, /from\("checkins"\)/);
  });

  it("awards visit points only through awardPoints with a deterministic source_ref", () => {
    assert.match(checkinsSrc, /import \{ awardPoints \} from "@\/lib\/points\/award"/);
    assert.match(checkinsSrc, /awardPoints\(admin, \{/);
    assert.match(checkinsSrc, /source: "daily_checkin"/);
    assert.match(checkinsSrc, /sourceRef: checkinSourceRef\(brandSlug, memberId, todayET\)/);
    assert.match(checkinsSrc, /communityId: brandSlug/);
    // The source_ref shape already in production is kept so retries collide.
    assert.match(checkinsSrc, /return `checkin:\$\{brandSlug\}:\$\{memberId\}:\$\{dateET\}`/);
    // No read-then-write on either denormalised total, and no direct ledger insert.
    assert.doesNotMatch(checkinsSrc, /select\("total_points"\)/);
    assert.doesNotMatch(checkinsSrc, /update\(\{ total_points/);
    assert.doesNotMatch(checkinsSrc, /from\("points_ledger"\)/);
    // Network event + founder multiplier only when the ledger row was written.
    assert.match(checkinsSrc, /const \{ awarded \} = await awardPoints/);
    assert.match(checkinsSrc, /if \(awarded\) \{/);
    assert.match(checkinsSrc, /scaledPoints\(CHECKIN_POINTS, multiplier\)/);
    // The checkins insert (which fires the Nellie's 3-visit trigger) stays.
    assert.match(checkinsSrc, /from\("checkins"\)\.insert\(/);
  });

  it("maps /profile to the member slug or /me instead of 404", () => {
    assert.match(profilePage, /redirect\("\/login\?next=\/profile"\)/);
    assert.match(profilePage, /getMemberProfileSlug/);
    assert.match(profilePage, /redirect\(`\/members\/\$\{slug\}`\)/);
    assert.match(profilePage, /redirect\("\/me"\)/);
  });
});
