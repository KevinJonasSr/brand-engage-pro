import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { uploadIsBrandScoped } from "./upload-scope.ts";

describe("uploadIsBrandScoped", () => {
  it("treats avatars as member uploads even if a brand is sent", () => {
    assert.equal(uploadIsBrandScoped("avatars", "nellies"), false);
    assert.equal(uploadIsBrandScoped("avatars", ""), false);
  });

  it("treats community uploads with no brand as member posts", () => {
    assert.equal(uploadIsBrandScoped("community-uploads", ""), false);
    assert.equal(uploadIsBrandScoped("community-uploads", "   "), false);
    assert.equal(uploadIsBrandScoped("community-uploads", null), false);
  });

  it("treats a named brand as an admin upload", () => {
    assert.equal(uploadIsBrandScoped("community-uploads", "nellies"), true);
  });
});

describe("upload routes keep member and admin rules", () => {
  const uploadSrc = readFileSync(
    fileURLToPath(new URL("../app/api/upload/route.ts", import.meta.url)),
    "utf8",
  );
  const videoSrc = readFileSync(
    fileURLToPath(new URL("../app/api/upload/video/route.ts", import.meta.url)),
    "utf8",
  );

  it("checks the billing lock only for brand-scoped image uploads", () => {
    assert.match(uploadSrc, /uploadIsBrandScoped/);
    assert.match(uploadSrc, /requireWritableBrand/);
    assert.match(uploadSrc, /canAccessBrand/);
  });

  it("requires an admin and a writable brand for video uploads", () => {
    assert.match(videoSrc, /getAdminContext/);
    assert.match(videoSrc, /requireWritableBrand/);
    assert.match(videoSrc, /status: 503/);
  });
});
