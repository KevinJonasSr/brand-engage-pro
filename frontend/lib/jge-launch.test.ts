import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  JGE_HIDDEN_TITLES,
  JGE_LAUNCH_BIO,
  JGE_PUBLISHED_SPECIAL_SLUGS,
  JGE_PUBLISHED_SPECIAL_TITLES,
  applyJgeLaunchBio,
  applyJgeLaunchSpecials,
  filterJgeLaunchEvents,
  isJgeHiddenTitle,
  jgeLaunchSpecials,
} from "./jge-launch.ts";
import { getBrand } from "./brands.ts";

describe("JGE Aug 30 specials lock", () => {
  it("surfaces house tour, early listens, and rotating live access", () => {
    assert.deepEqual(JGE_PUBLISHED_SPECIAL_TITLES, [
      "Music Row House Tour",
      "Early Writer / Artist Listens",
      "Rotating Live Access",
    ]);
    assert.deepEqual(JGE_PUBLISHED_SPECIAL_SLUGS, [
      "jge-music-row-house-tour",
      "jge-early-writer-listens",
      "jge-rotating-live-access",
    ]);
    const live = jgeLaunchSpecials();
    assert.equal(live.length, 3);
    assert.ok(live.every((s) => s.tier === "public"));
    assert.match(live[2].description ?? "", /Kevin/);
    assert.match(live[2].description ?? "", /Leslie/);
    assert.match(live[2].description ?? "", /Amanda/);
    assert.match(live[2].description ?? "", /Abby/);
    assert.match(live[2].description ?? "", /Raymond/);
  });

  it("hides roster/presale, listening parties, and songwriter rounds", () => {
    for (const title of [
      ...JGE_HIDDEN_TITLES,
      "Roster Presale Access",
      "Member Listening Parties",
      "Songwriter Round at the Music Row House",
    ]) {
      assert.equal(isJgeHiddenTitle(title), true, title);
    }
    assert.equal(isJgeHiddenTitle("Music Row House Tour"), false);
  });

  it("replaces DB leftovers with the lock set", () => {
    const shown = applyJgeLaunchSpecials("jonas-group-ent", [
      { id: "1", title: "Roster Presale Access" },
      { id: "2", title: "Member Listening Parties" },
      { id: "3", title: "Songwriter Round at the Nashville HQ" },
      { id: "4", title: "Music Row House Tour" },
    ]);
    assert.deepEqual(
      shown.map((s) => s.title),
      [...JGE_PUBLISHED_SPECIAL_TITLES],
    );
    assert.equal(shown[0].id, "4");
  });

  it("stamps the lock bio and does not market hidden offers", () => {
    assert.match(JGE_LAUNCH_BIO, /Music Row house tour/);
    assert.match(JGE_LAUNCH_BIO, /rotating live/);
    assert.doesNotMatch(JGE_LAUNCH_BIO, /listening-party invites/);
    assert.doesNotMatch(JGE_LAUNCH_BIO, /early ticket access for roster/);
    assert.equal(
      applyJgeLaunchBio("jonas-group-ent", "Members get listening-party invites"),
      JGE_LAUNCH_BIO,
    );
    assert.equal(applyJgeLaunchBio("nellies", "Jackie stays"), "Jackie stays");
    assert.equal(getBrand("jonas-group-ent")?.bio, JGE_LAUNCH_BIO);
    const brandsDataSrc = readFileSync(
      fileURLToPath(new URL("./data/brands.ts", import.meta.url)),
      "utf8",
    );
    assert.match(brandsDataSrc, /applyJgeLaunchBio/);
  });

  it("does not rewrite Nellie's specials", () => {
    const rows = [{ id: "n", title: "Free Dessert w/ Entree" }];
    assert.deepEqual(applyJgeLaunchSpecials("nellies", rows), rows);
  });

  it("drops hidden titles from JGE events", () => {
    const kept = filterJgeLaunchEvents("jonas-group-ent", [
      { title: "New-Release Listening Party — Spring Drop" },
      { title: "Songwriter Round at the Music Row House" },
      { title: "Music Row House Tour — Founders" },
    ]);
    assert.deepEqual(
      kept.map((e) => e.title),
      ["Music Row House Tour — Founders"],
    );
  });

  it("wires specials + brand fallback through the lock", () => {
    const specialsSrc = readFileSync(
      fileURLToPath(new URL("./data/specials.ts", import.meta.url)),
      "utf8",
    );
    const brandsSrc = readFileSync(
      fileURLToPath(new URL("./brands.ts", import.meta.url)),
      "utf8",
    );
    const brandsDataSrc = readFileSync(
      fileURLToPath(new URL("./data/brands.ts", import.meta.url)),
      "utf8",
    );
    const latestSrc = readFileSync(
      fileURLToPath(new URL("../components/latest-strip.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(specialsSrc, /applyJgeLaunchSpecials/);
    assert.match(brandsDataSrc, /filterJgeLaunchEvents|applyJgeLaunch/);
    assert.match(latestSrc, /filterJgeLaunchEvents/);
    assert.doesNotMatch(brandsSrc, /New-Release Listening Party/);
    assert.doesNotMatch(brandsSrc, /Songwriter Round at the Music Row House/);
    assert.doesNotMatch(brandsSrc, /listening-party invites/);
    assert.match(brandsSrc, /Music Row house tour/);
    assert.match(brandsSrc, /rotating live/);
    const brandPageSrc = readFileSync(
      fileURLToPath(new URL("../app/brands/[slug]/page.tsx", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(brandPageSrc, /intimate listening parties/);
    assert.match(brandPageSrc, /JGE_BRAND_SLUG/);
  });

  it("does not let Nellie's hide list strip JGE on search or member home", () => {
    const searchSrc = readFileSync(
      fileURLToPath(new URL("./search/query.ts", import.meta.url)),
      "utf8",
    );
    const homeSrc = readFileSync(
      fileURLToPath(new URL("./data/member-home.ts", import.meta.url)),
      "utf8",
    );
    assert.match(searchSrc, /isJgePublishedSpecialTitle/);
    assert.match(searchSrc, /JGE_BRAND_SLUG/);
    assert.doesNotMatch(searchSrc, /isNelliesHiddenTitle/);
    assert.match(homeSrc, /isJgeHiddenTitle/);
    assert.match(homeSrc, /JGE_BRAND_SLUG/);
  });
});
