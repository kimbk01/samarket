import { readFileSync } from "node:fs";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORE_PRODUCT_LIST_DERIVATIVE_MARKER,
  STORE_PRODUCT_UPLOAD_SURFACES,
} from "@/lib/media/canonical-image-contract";
import {
  storeProductListDerivativeOriginalPath,
  storeProductOriginalHasListDerivative,
} from "@/lib/media/canonical-image-path";
import { resolveCanonicalImageUrl } from "@/lib/media/canonical-image-resolver";
import { buildCanonicalDerivativeBuffers } from "@/lib/media/canonical-image-pipeline.server";
import {
  canonicalStoragePathsForOriginal,
  uploadCanonicalImageAsset,
  uploadStoreProductWithHeroDerivative,
} from "@/lib/media/canonical-image-upload.server";
import {
  buildStoreProductThumbnailFetchUrl,
  buildStoreProductThumbnailFetchUrlFromPreset,
} from "@/lib/media/store-product-image-transform";
import { storeImageBaseKey } from "@/lib/stores/store-product-images-orphan-gc";

const HOST = "https://abc.supabase.co";
const OBJ = `${HOST}/storage/v1/object/public/store-product-images`;
const SID = "11111111-1111-4111-8111-111111111111";
const MARKED = `${OBJ}/${SID}/aaaa.l1.webp`;
const LEGACY = `${OBJ}/${SID}/bbbb.webp`;

describe("IMG-01 — list-size derivative for store images (upload-time, marker-gated)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOST);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("upload path carries the marker; marker detection follows the stored file name only", () => {
    expect(STORE_PRODUCT_UPLOAD_SURFACES).toEqual(["hero", "feed"]);
    const p = storeProductListDerivativeOriginalPath(SID, "aaaa", "webp");
    expect(p).toBe(`${SID}/aaaa${STORE_PRODUCT_LIST_DERIVATIVE_MARKER}.webp`);
    expect(storeProductOriginalHasListDerivative(p)).toBe(true);
    expect(storeProductOriginalHasListDerivative(`${SID}/aaaa.l1.jpg`)).toBe(true);
    expect(storeProductOriginalHasListDerivative(`${SID}/bbbb.webp`)).toBe(false);
    expect(storeProductOriginalHasListDerivative(`${SID}/aaaa.l1.feed.webp`)).toBe(false);
  });

  it("list surfaces use .feed.webp only for marked originals; legacy originals stay original", () => {
    expect(resolveCanonicalImageUrl({ raw: MARKED, surface: "feed" })).toBe(`${OBJ}/${SID}/aaaa.l1.feed.webp`);
    expect(resolveCanonicalImageUrl({ raw: MARKED, surface: "thumb" })).toBe(`${OBJ}/${SID}/aaaa.l1.feed.webp`);
    expect(resolveCanonicalImageUrl({ raw: MARKED, surface: "detail" })).toBe(MARKED);
    expect(resolveCanonicalImageUrl({ raw: MARKED, surface: "hero" })).toBe(`${OBJ}/${SID}/aaaa.l1.hero.webp`);
    expect(resolveCanonicalImageUrl({ raw: LEGACY, surface: "feed" })).toBe(LEGACY);
    expect(resolveCanonicalImageUrl({ raw: LEGACY, surface: "thumb" })).toBe(LEGACY);
    expect(resolveCanonicalImageUrl({ raw: LEGACY, surface: "hero" })).toBe(`${OBJ}/${SID}/bbbb.hero.webp`);
  });

  it("delivery list presets resolve to the derivative; hero presets unchanged", () => {
    expect(buildStoreProductThumbnailFetchUrlFromPreset(MARKED, "hubFood")).toBe(
      `${OBJ}/${SID}/aaaa.l1.feed.webp`
    );
    expect(buildStoreProductThumbnailFetchUrlFromPreset(LEGACY, "hubFood")).toBe(LEGACY);
    expect(buildStoreProductThumbnailFetchUrlFromPreset(MARKED, "detailHero")).toBe(
      `${OBJ}/${SID}/aaaa.l1.hero.webp`
    );
    expect(buildStoreProductThumbnailFetchUrl(MARKED, 184)).toBe(`${OBJ}/${SID}/aaaa.l1.feed.webp`);
    expect(buildStoreProductThumbnailFetchUrl(LEGACY, 184)).toBe(LEGACY);
  });

  it("SamarketThumbnail routes store images through the canonical resolver", () => {
    const src = readFileSync("components/common/SamarketThumbnail.tsx", "utf8");
    expect(src).toContain("return resolveCanonicalImageUrl({ raw: objectUrl, surface }) ?? objectUrl;");
  });

  it("delete cascade and orphan GC group the derivative with its original", () => {
    expect(canonicalStoragePathsForOriginal(`${SID}/aaaa.l1.webp`, "store-product-images")).toEqual([
      `${SID}/aaaa.l1.webp`,
      `${SID}/aaaa.l1.hero.webp`,
      `${SID}/aaaa.l1.feed.webp`,
    ]);
    expect(storeImageBaseKey(`${SID}/aaaa.l1.feed.webp`)).toBe(storeImageBaseKey(`${SID}/aaaa.l1.webp`));
  });

  it("store feed derivative keeps the aspect (inside, ≤960); post feed stays square 640", async () => {
    const buf = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: { r: 200, g: 80, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const [storeFeed] = await buildCanonicalDerivativeBuffers({
      buf,
      mimeType: "image/jpeg",
      surfaces: ["feed"],
      bucket: "store-product-images",
    });
    expect(storeFeed).toMatchObject({ surface: "feed", width: 960, height: 480 });
    const [postFeed] = await buildCanonicalDerivativeBuffers({
      buf,
      mimeType: "image/jpeg",
      surfaces: ["feed"],
    });
    expect(postFeed).toMatchObject({ width: 640, height: 640 });
  });

  it("marked upload requires the feed derivative — missing derivative rolls back the whole upload", async () => {
    const uploads: string[] = [];
    const removed: string[][] = [];
    const sb = {
      storage: {
        from: () => ({
          upload: async (path: string) => {
            uploads.push(path);
            return { error: null };
          },
          remove: async (paths: string[]) => {
            removed.push(paths);
            return { error: null };
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `${OBJ}/${path}` } }),
        }),
      },
    } as unknown as SupabaseClient;

    const gif = Buffer.from("GIF89a");
    // GIF → derivative builder returns none → required `feed` missing → throw + rollback
    await expect(
      uploadCanonicalImageAsset({
        sb,
        bucket: "store-product-images",
        originalPath: `${SID}/x.l1.gif`,
        originalBuf: gif,
        originalContentType: "image/gif",
        surfaces: ["hero", "feed"],
        requiredSurfaces: ["feed"],
      })
    ).rejects.toThrow("derivative_missing:feed");
    expect(removed.at(-1)).toEqual([`${SID}/x.l1.gif`]);

    const png = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .webp()
      .toBuffer();
    const ok = await uploadStoreProductWithHeroDerivative({
      sb,
      originalPath: `${SID}/y.l1.webp`,
      primaryBuf: png,
      primaryContentType: "image/webp",
    });
    expect(ok.derivativePaths).toEqual({
      hero: `${SID}/y.l1.hero.webp`,
      feed: `${SID}/y.l1.feed.webp`,
    });
  });

  it("owner upload route stores marked originals", () => {
    // 3-C §9-3 — 업로드 본문은 오너·관리자 샘플 공용 코어로 이동 (라우트는 가드 후 코어 호출만).
    const route = readFileSync("app/api/me/stores/[storeId]/upload-image/route.ts", "utf8");
    expect(route).toContain("uploadStoreImageCore(sb, sid, ownerCatalogActor(userId), req)");
    const src = readFileSync("lib/stores/owner-catalog/upload-image-core.server.ts", "utf8");
    expect(src).toContain("storeProductListDerivativeOriginalPath(sid, randomUUID(), processed.ext)");
  });
});
