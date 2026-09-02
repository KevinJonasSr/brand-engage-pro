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

  it("maps /profile to the member slug or /me instead of 404", () => {
    assert.match(profilePage, /redirect\("\/login\?next=\/profile"\)/);
    assert.match(profilePage, /getMemberProfileSlug/);
    assert.match(profilePage, /redirect\(`\/members\/\$\{slug\}`\)/);
    assert.match(profilePage, /redirect\("\/me"\)/);
  });
});
