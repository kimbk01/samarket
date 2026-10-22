import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FUNCTION_MULTIPART_IMAGE_SAFE_MAX_BYTES } from "@/lib/media/function-upload-limits";
import {
  prepareImageFileForFunctionUpload,
  readFunctionUploadJson,
} from "@/lib/media/client-image-upload-prepare";
import {
  OWNER_PRODUCT_IMAGE_MAX_BYTES,
  OWNER_PRODUCT_IMAGE_PICK_MAX_BYTES,
} from "@/lib/stores/owner-product-images";
import { processOwnerProductImageBuffer } from "@/lib/stores/owner-product-image-upload.server";
import { parseStoreReviewImageUrls } from "@/lib/stores/store-review-image-urls";
import { validateOwnerBannerAssetInput } from "@/lib/stores/advertising/owner-banner-contract";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { formatOwnerStoreImageUploadError } from "@/lib/business/owner-store-patch-error-i18n";
import { resolveOwnerProductRegisterError } from "@/lib/business/owner-product-register-error";
import { translate } from "@/lib/i18n/messages";

const VERCEL_FUNCTION_BODY_LIMIT = 4.5 * 1024 * 1024;

describe("IMG-02 — uploads stay under the function body limit and 413 is handled", () => {
  it("client + server limits are below the Vercel function body limit", () => {
    expect(FUNCTION_MULTIPART_IMAGE_SAFE_MAX_BYTES).toBeLessThan(VERCEL_FUNCTION_BODY_LIMIT);
    expect(OWNER_PRODUCT_IMAGE_MAX_BYTES).toBe(FUNCTION_MULTIPART_IMAGE_SAFE_MAX_BYTES);
    // 고르는 단계는 카메라 원본까지 허용 — 클라이언트가 업로드 상한 아래로 압축
    expect(OWNER_PRODUCT_IMAGE_PICK_MAX_BYTES).toBeGreaterThan(OWNER_PRODUCT_IMAGE_MAX_BYTES);
    const review = readFileSync("app/api/me/store-reviews/upload-image/route.ts", "utf8");
    expect(review).toContain("const MAX_BYTES = FUNCTION_MULTIPART_IMAGE_SAFE_MAX_BYTES;");
    const owner = readFileSync("app/api/me/stores/[storeId]/upload-image/route.ts", "utf8");
    expect(owner).not.toContain("20MB");
  });

  it("small files pass through untouched; oversize files never get sent when they cannot be shrunk", async () => {
    const small = new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" });
    await expect(prepareImageFileForFunctionUpload(small, 100)).resolves.toEqual({
      ok: true,
      file: small,
      resized: false,
    });
    // node(vitest) 에는 document 가 없어 축소 불가 → 전송하지 않고 file_too_large
    const big = new File([new Uint8Array(200)], "b.jpg", { type: "image/jpeg" });
    await expect(prepareImageFileForFunctionUpload(big, 100)).resolves.toEqual({
      ok: false,
      error: "file_too_large",
    });
  });

  it("non-JSON 413 / HTML error page become error codes instead of a res.json() crash", async () => {
    const r413 = new Response("<html>Request Entity Too Large</html>", { status: 413 });
    await expect(readFunctionUploadJson(r413)).resolves.toEqual({ ok: false, error: "file_too_large" });
    const r502 = new Response("Bad gateway", { status: 502 });
    await expect(readFunctionUploadJson(r502)).resolves.toEqual({ ok: false, error: "upload_failed" });
    const ok = new Response(JSON.stringify({ ok: true, url: "u" }), { status: 200 });
    await expect(readFunctionUploadJson(ok)).resolves.toEqual({ ok: true, url: "u" });
  });

  it("file_too_large maps to an i18n message on every owner surface (ko + en)", () => {
    for (const lang of ["ko", "en"] as const) {
      const msg = translate(lang, "business_image_upload_too_large");
      expect(msg).not.toBe("business_image_upload_too_large");
      const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
      expect(resolveOwnerApiErrorMessage("file_too_large", t)).toBe(msg);
      expect(formatOwnerStoreImageUploadError({ error: "file_too_large" }, lang)).toBe(msg);
      expect(resolveOwnerProductRegisterError("file_too_large", "new", t).description).toBe(msg);
      expect(translate(lang, "mypage_comp_store_review_upload_too_large")).not.toBe(
        "mypage_comp_store_review_upload_too_large"
      );
    }
  });

  it("all owner store-image uploaders use the shared prepare + safe-JSON sender", () => {
    for (const p of [
      "components/business/OwnerStoreProfileForm.tsx",
      "components/business/OwnerStoreBasicInfoForm.tsx",
      "components/business/owner/OwnerStoreNoticesView.tsx",
      "components/business/owner/OwnerGiftCertificatesView.tsx",
      "components/business/owner/OwnerStoreBannersView.tsx",
    ]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).toContain("postStoreOwnerImageUpload(");
      expect(src, p).not.toContain("/upload-image`");
    }
    const client = readFileSync("lib/stores/upload-store-product-image-client.ts", "utf8");
    expect(client).toContain("prepareImageFileForFunctionUpload(file, OWNER_PRODUCT_IMAGE_MAX_BYTES)");
    expect(client).not.toMatch(/await res\.json\(\)\)/);
    for (const p of [
      "components/mypage/StoreOrderReviewForm.tsx",
      "components/business/owner/ads/OwnerBannerCreateView.tsx",
      "components/business/owner/ads/OwnerEventPromotionDetailClient.tsx",
    ]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).toContain("prepareImageFileForFunctionUpload(");
      expect(src, p).toContain("readFunctionUploadJson");
    }
  });
});

describe("IMG-04a — review image_urls accept only this buyer's review upload path", () => {
  const HOST = "https://abc.supabase.co";
  const BUYER = "b1b1b1b1-0000-4000-8000-000000000001";
  const ORDER = "0a0a0a0a-0000-4000-8000-000000000002";
  const ctx = { buyerId: BUYER, orderId: ORDER, supabaseUrl: HOST };
  const own = `${HOST}/storage/v1/object/public/post-images/${BUYER}/store-reviews/${ORDER}/x.webp`;

  it("own upload accepted (deduped, max 3)", () => {
    expect(parseStoreReviewImageUrls([own, own], ctx)).toEqual({ ok: true, urls: [own] });
    expect(parseStoreReviewImageUrls(undefined, ctx)).toEqual({ ok: true, urls: [] });
    const many = [1, 2, 3, 4].map((i) => own.replace("x.webp", `${i}.webp`));
    const r = parseStoreReviewImageUrls(many, ctx);
    expect(r.ok && r.urls.length).toBe(3);
  });

  it.each([
    ["external host", "https://attacker.example/x.png"],
    ["external host with our path", `https://attacker.example/storage/v1/object/public/post-images/${BUYER}/store-reviews/${ORDER}/x.webp`],
    ["other buyer", own.replace(BUYER, "c2c2c2c2-0000-4000-8000-000000000003")],
    ["other order", own.replace(`/${ORDER}/`, "/ffffffff-0000-4000-8000-000000000004/")],
    ["other bucket", own.replace("/post-images/", "/store-product-images/")],
    ["traversal", `${HOST}/storage/v1/object/public/post-images/${BUYER}/store-reviews/${ORDER}/../../x.webp`],
    ["tracking query", `${own}?t=1`],
  ])("rejects %s", (_label, url) => {
    expect(parseStoreReviewImageUrls([url], ctx)).toEqual({ ok: false, error: "invalid_image_urls" });
  });

  it("fails closed without the Supabase URL", () => {
    expect(parseStoreReviewImageUrls([own], { ...ctx, supabaseUrl: undefined }).ok).toBe(false);
  });

  it("review POST route uses the ownership parser", () => {
    const src = readFileSync("app/api/me/store-reviews/route.ts", "utf8");
    expect(src).toContain("parseStoreReviewImageUrls(body.image_urls, {");
    expect(src).not.toContain("function parseImageUrls(");
  });
});

describe("IMG-04c — owner banner assetPath / dimensions are validated server-side", () => {
  const SID = "5e5e5e5e-0000-4000-8000-000000000005";
  const base = { storeId: SID, sourceWidth: 1170, sourceHeight: 480 };
  const own = `_owner/delivery-ads/banner/${SID}/draft/u1/abc.webp`;

  it("accepts the store's own upload prefix", () => {
    expect(validateOwnerBannerAssetInput({ ...base, assetPath: own })).toEqual({ ok: true });
  });

  it.each([
    ["other store", `_owner/delivery-ads/banner/6f6f6f6f-0000-4000-8000-000000000006/draft/u1/a.webp`],
    ["external URL", "https://attacker.example/a.png"],
    ["absolute path", `/_owner/delivery-ads/banner/${SID}/a.webp`],
    ["traversal", `_owner/delivery-ads/banner/${SID}/../other/a.webp`],
    ["prefix only", `_owner/delivery-ads/banner/${SID}/`],
  ])("rejects %s", (_l, assetPath) => {
    expect(validateOwnerBannerAssetInput({ ...base, assetPath })).toEqual({
      ok: false,
      error: "invalid_asset_path",
    });
  });

  it("rejects non-integer / out-of-range dimensions", () => {
    for (const [w, h] of [
      [0, 480],
      [1170.5, 480],
      [99999, 480],
      [Number.NaN, 480],
    ]) {
      expect(validateOwnerBannerAssetInput({ storeId: SID, assetPath: own, sourceWidth: w!, sourceHeight: h! })).toEqual({
        ok: false,
        error: "invalid_dimensions",
      });
    }
  });

  it("reusing the superseded creative requires its exact stored path + dimensions", () => {
    const existing = { assetPath: "admin/final/x.webp", sourceWidth: 1170, sourceHeight: 480 };
    expect(validateOwnerBannerAssetInput({ ...base, assetPath: existing.assetPath, existing })).toEqual({ ok: true });
    expect(
      validateOwnerBannerAssetInput({ ...base, sourceWidth: 2340, sourceHeight: 960, assetPath: existing.assetPath, existing })
    ).toEqual({ ok: false, error: "invalid_dimensions" });
  });

  it("writer applies the check before the RPC (admin-produced pending asset exempt)", () => {
    const src = readFileSync("lib/stores/advertising/owner-banner-writer.ts", "utf8");
    expect(src).toContain("validateOwnerBannerAssetInput({");
    expect(src.indexOf("validateOwnerBannerAssetInput({")).toBeLessThan(
      src.indexOf('sb.rpc("owner_delivery_banner_upsert"')
    );
  });
});

describe("IMG-09 — owner ad / event uploads are re-encoded (orientation applied, EXIF/GPS stripped)", () => {
  it("processOwnerProductImageBuffer applies EXIF rotation and drops metadata", async () => {
    const withExif = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "gps-test" } } })
      .toBuffer();
    const before = await sharp(withExif).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif).toBeTruthy();

    const out = await processOwnerProductImageBuffer(withExif, "image/jpeg");
    const after = await sharp(out.buf).metadata();
    expect(out.contentType).toBe("image/webp");
    expect(after.exif).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    // orientation 6 = 90° → 400×200 becomes 200×400
    expect([out.width, out.height]).toEqual([200, 400]);
  });

  it("banner + event upload routes store the re-encoded buffer, not the raw file", () => {
    for (const p of [
      "app/api/me/stores/[storeId]/delivery-ads/upload-banner-image/route.ts",
      "app/api/me/event-promotion-requests/[requestId]/upload-image/route.ts",
    ]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).toContain("processOwnerProductImageBuffer(");
      expect(src, p).toContain("contentType: processed.contentType");
      expect(src, p).toContain("const buf = processed.buf;");
    }
  });
});
