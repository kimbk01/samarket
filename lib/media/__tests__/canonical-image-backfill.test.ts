import { describe, expect, it } from "vitest";
import {
  assertBackfillBucket,
  classifyStorageObjectPath,
  planBackfillCandidate,
} from "@/lib/media/canonical-image-backfill.lib";

describe("canonical-image-backfill.lib", () => {
  it("assertBackfillBucket — allowlist only", () => {
    expect(assertBackfillBucket("post-images")).toBe("post-images");
    expect(() => assertBackfillBucket("avatars")).toThrow(/bucket_not_allowed/);
  });

  it("classifyStorageObjectPath — derivative vs original", () => {
    expect(classifyStorageObjectPath("u1/a.feed.webp")).toBe("derivative");
    expect(classifyStorageObjectPath("u1/a.jpg")).toBe("original");
    expect(classifyStorageObjectPath("u1/a.feed.webp.jpg")).toBe("original");
    expect(classifyStorageObjectPath("u1/a.txt")).toBe("invalid");
  });

  it("planBackfillCandidate — missing surfaces only", () => {
    const candidate = planBackfillCandidate({
      originalPath: "u1/a.jpg",
      bucket: "post-images",
      existingDerivativePaths: new Set(["u1/a.feed.webp"]),
    });
    expect(candidate?.missingSurfaces).toEqual(["thumb", "detail"]);
    expect(candidate?.derivativePaths.feed).toBe("u1/a.feed.webp");
  });

  it("planBackfillCandidate — complete skips", () => {
    const existing = new Set([
      "u1/a.thumb.webp",
      "u1/a.feed.webp",
      "u1/a.detail.webp",
    ]);
    expect(
      planBackfillCandidate({
        originalPath: "u1/a.jpg",
        bucket: "post-images",
        existingDerivativePaths: existing,
      })
    ).toBeNull();
  });
});
