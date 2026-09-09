/**
 * DIBAY SHARED post-images OWNERSHIP CLOSE — targeted contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  POST_IMAGES_ACTIVE_WRITERS,
  POST_IMAGES_AMBIGUOUS_POLICY,
  POST_IMAGES_BUCKET,
  POST_IMAGES_BUCKET_WIDE_DELETE,
  POST_IMAGES_CHAT_RESET_STORAGE_POLICY,
  POST_IMAGES_PROFILE_RESET_STORAGE_POLICY,
  classifyPostImagesPath,
  expandPostImagesStoragePaths,
  normalizePostImagesObjectPath,
  postImagesCleanupForResetDomain,
} from "@/lib/media/post-images-storage-ownership";
import {
  resolveStorageObjectsForReset,
  storageTargetsHashIdentity,
} from "@/lib/admin/data-reset/resolve-storage-objects-for-reset";
import { hashDataResetPayload } from "@/lib/admin/data-reset/types";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("post-images ownership SSOT", () => {
  it("inventories active writers without bucket-wide delete", () => {
    expect(POST_IMAGES_BUCKET).toBe("post-images");
    expect(POST_IMAGES_BUCKET_WIDE_DELETE).toBe("FORBIDDEN");
    expect(POST_IMAGES_ACTIVE_WRITERS.length).toBeGreaterThanOrEqual(8);
    const domains = new Set(POST_IMAGES_ACTIVE_WRITERS.map((w) => w.domain));
    expect(domains.has("community")).toBe(true);
    expect(domains.has("market")).toBe(true);
    expect(domains.has("chat")).toBe(true);
    expect(domains.has("profile")).toBe(true);
    expect(POST_IMAGES_CHAT_RESET_STORAGE_POLICY).toBe("PRESERVE");
    expect(POST_IMAGES_PROFILE_RESET_STORAGE_POLICY).toBe("PRESERVE");
    expect(POST_IMAGES_AMBIGUOUS_POLICY).toBe("SKIP_AMBIGUOUS");
  });

  it("classifies path ownership (explicit / derivable / ambiguous)", () => {
    expect(classifyPostImagesPath("u1/profile/a.webp")).toMatchObject({
      domain: "profile",
      ownership: "OWNERSHIP_EXPLICIT",
    });
    expect(
      classifyPostImagesPath("u1/community/messenger-image/room1/x.jpg")
    ).toMatchObject({ domain: "chat", ownership: "OWNERSHIP_EXPLICIT" });
    expect(classifyPostImagesPath("u1/community/abc.jpg")).toMatchObject({
      domain: "community",
      ownership: "OWNERSHIP_DERIVABLE",
    });
    expect(classifyPostImagesPath("u1/1710000000-deadbeef.jpg")).toMatchObject({
      domain: "market",
      ownership: "OWNERSHIP_AMBIGUOUS",
    });
  });

  it("normalizes public URL to path and never keeps raw URL for remove", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/public/post-images/u1/community/x.jpg?token=1";
    expect(normalizePostImagesObjectPath(url)).toBe("u1/community/x.jpg");
    expect(normalizePostImagesObjectPath("u1/community/x.jpg")).toBe("u1/community/x.jpg");
    expect(normalizePostImagesObjectPath("https://evil.example/x.jpg")).toBeNull();
  });

  it("cross-domain cleanup: community/market preserve chat+profile; ambiguous skip", () => {
    const profile = classifyPostImagesPath("u1/profile/a.webp");
    const chat = classifyPostImagesPath("u1/community/messenger-image/r/a.jpg");
    const community = classifyPostImagesPath("u1/community/a.jpg");
    const marketAmb = classifyPostImagesPath("u1/171-abcdef.jpg");

    expect(postImagesCleanupForResetDomain("community", profile)).toBe("PRESERVE");
    expect(postImagesCleanupForResetDomain("community", chat)).toBe("PRESERVE");
    expect(postImagesCleanupForResetDomain("community", community)).toBe("DELETE");
    expect(postImagesCleanupForResetDomain("community", marketAmb)).toBe("SKIP_AMBIGUOUS");

    expect(postImagesCleanupForResetDomain("market", community)).toBe("PRESERVE");
    expect(postImagesCleanupForResetDomain("market", profile)).toBe("PRESERVE");
    expect(postImagesCleanupForResetDomain("chat", community)).toBe("PRESERVE");
  });

  it("expands derivatives for owned originals", () => {
    const paths = expandPostImagesStoragePaths("u1/community/a.jpg");
    expect(paths[0]).toBe("u1/community/a.jpg");
    expect(paths.some((p) => p.endsWith(".thumb.webp"))).toBe(true);
    expect(paths.some((p) => p.endsWith(".feed.webp"))).toBe(true);
  });
});

describe("resolveStorageObjectsForReset", () => {
  function mockSelectRows(rowsByTable: Record<string, unknown[]>) {
    return {
      from(table: string) {
        const rows = rowsByTable[table] ?? [];
        const api: Record<string, unknown> = {};
        const finish = () => Promise.resolve({ data: rows, error: null });
        api.select = () => api;
        api.eq = () => api;
        api.in = () => api;
        api.limit = () => finish();
        api.maybeSingle = () =>
          Promise.resolve({ data: rows[0] ?? null, error: null });
        return api;
      },
    };
  }

  it("community reset selects community images and preserves market/chat/profile refs", async () => {
    const sb = mockSelectRows({
      community_posts: [
        {
          id: "c1",
          images: [
            "https://x.supabase.co/storage/v1/object/public/post-images/u1/community/own.jpg",
            "https://x.supabase.co/storage/v1/object/public/post-images/u1/profile/avatar.webp",
            "https://x.supabase.co/storage/v1/object/public/post-images/u1/community/messenger-image/r/chat.jpg",
            "https://x.supabase.co/storage/v1/object/public/post-images/u1/171-market.jpg",
          ],
        },
      ],
      community_post_images: [],
    }) as never;

    const resolved = await resolveStorageObjectsForReset({
      sb,
      domain: "community",
      entityIds: ["c1"],
    });

    expect(resolved.ownedObjects.some((o) => o.path.includes("community/own"))).toBe(true);
    expect(resolved.ownedObjects.every((o) => o.cleanupPolicy === "DELETE")).toBe(true);
    expect(resolved.ownedObjects.some((o) => o.path.includes("profile/"))).toBe(false);
    expect(resolved.ownedObjects.some((o) => o.path.includes("messenger-image"))).toBe(false);
    expect(resolved.preservedObjects.some((o) => o.path.includes("profile/"))).toBe(true);
    expect(resolved.preservedObjects.some((o) => o.path.includes("messenger-image"))).toBe(true);
    expect(resolved.ambiguousObjects.some((o) => o.path.includes("171-market"))).toBe(true);
  });

  it("market reset selects listing images and preserves community paths", async () => {
    const sb = mockSelectRows({
      posts: [
        {
          id: "p1",
          images: [
            "https://x.supabase.co/storage/v1/object/public/post-images/u1/171-listing.jpg",
            "https://x.supabase.co/storage/v1/object/public/post-images/u1/community/other.jpg",
          ],
          thumbnail_url: null,
        },
      ],
    }) as never;

    const resolved = await resolveStorageObjectsForReset({
      sb,
      domain: "market",
      entityIds: ["p1"],
    });

    expect(resolved.ownedObjects.some((o) => o.path.includes("171-listing"))).toBe(true);
    expect(resolved.ownedObjects.some((o) => o.path.includes("community/other"))).toBe(false);
    expect(resolved.preservedObjects.some((o) => o.path.includes("community/other"))).toBe(true);
  });

  it("chat reset never owns storage deletes", async () => {
    const resolved = await resolveStorageObjectsForReset({
      sb: mockSelectRows({}) as never,
      domain: "chat",
      entityIds: null,
    });
    expect(resolved.ownedObjects).toEqual([]);
    expect(resolved.warnings.join(" ")).toMatch(/preserve/i);
  });

  it("plan hash identity binds owned targets only", () => {
    const a = storageTargetsHashIdentity([
      {
        bucket: "post-images",
        path: "u1/community/a.jpg",
        cleanupPolicy: "DELETE",
      },
      {
        bucket: "post-images",
        path: "u1/profile/b.webp",
        cleanupPolicy: "PRESERVE",
      },
    ]);
    expect(a).toEqual([
      { bucket: "post-images", path: "u1/community/a.jpg", cleanupPolicy: "DELETE" },
    ]);
    expect(hashDataResetPayload({ storageTargets: a })).toBe(
      hashDataResetPayload({ storageTargets: a })
    );
  });

  it("planner/execute wire ownership resolver — no bucket purge", () => {
    const planner = read("lib/admin/data-reset/planner.ts");
    const exec = read("lib/admin/data-reset/execute.ts");
    expect(planner).toContain("resolveStorageObjectsForReset");
    expect(planner).toContain("storageTargetsHashIdentity");
    expect(exec).toContain("runStorageActions");
    expect(exec).toContain("storageTargets");
    expect(exec).not.toContain(".list(");
    expect(exec).not.toContain("wipe-all");
    expect(exec).toContain("No bucket list / prefix purge");
    expect(read("lib/media/post-images-storage-ownership.ts")).toContain(
      "POST_IMAGES_BUCKET_WIDE_DELETE"
    );
  });
});
