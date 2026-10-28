/**
 * 2026-10-29 재감사 §H-B·§H-C — 이미지 삭제 참조 확인·배너 업로드·정리 크론 · 샘플 운영 설정 · 방문형 문구.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAdminSampleOperationsPatch } from "@/lib/stores/sample/admin-sample-store-operations";
import { parseBannerUploadCampaignSegment } from "@/lib/stores/advertising/banner-upload-campaign-segment";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("HB-1 replaced/deleted images are kept while another row still uses them", () => {
  it("every owner image cleanup checks references first", () => {
    for (const f of [
      "lib/stores/catalog/update-store-product.ts",
      "app/api/me/stores/[storeId]/notices/[noticeId]/route.ts",
      "app/api/me/stores/[storeId]/banners/[bannerId]/route.ts",
    ]) {
      const src = read(f);
      const removals = src.match(/removeCanonicalImagesFromPublicUrls\(\{/g)?.length ?? 0;
      const guarded = src.match(/Unreferenced = await dropStillReferencedStoreImageUrls\(sb, sid, /g)?.length ?? 0;
      expect(guarded, f).toBe(removals);
    }
  });
});

describe("HB-2 / HB-3 orphan GC", () => {
  it("runs daily as dry-run and reports folders of deleted stores", () => {
    const crons = JSON.parse(read("vercel.json")).crons as Array<{ path: string }>;
    expect(crons.some((c) => c.path === "/api/cron/store-product-images-orphan-gc")).toBe(true);
    expect(read("lib/stores/store-product-images-orphan-gc.server.ts")).toContain("result.missing_store_objects += row.objects;");
  });
});

describe("HB-5 / HB-6 banner uploads", () => {
  it("campaign path segment is a UUID or the fixed placeholder", () => {
    expect(parseBannerUploadCampaignSegment("", "draft")).toEqual({ ok: true, segment: "draft" });
    expect(parseBannerUploadCampaignSegment("../x", "draft")).toEqual({ ok: false });
    expect(parseBannerUploadCampaignSegment("A1B2C3D4-0000-4000-8000-000000000000", "unbound")).toEqual({
      ok: true,
      segment: "a1b2c3d4-0000-4000-8000-000000000000",
    });
  });
  it("admin banner upload re-encodes like owner uploads and both are rate limited", () => {
    const admin = read("app/api/admin/delivery-ads/upload-banner-image/route.ts");
    expect(admin).toContain("processOwnerProductImageBuffer(");
    expect(admin).not.toContain('import sharp from "sharp"');
    expect(admin).toContain("enforceImageUploadQuota(admin.userId");
    expect(read("app/api/me/stores/[storeId]/delivery-ads/upload-banner-image/route.ts")).toContain("enforceStoreOwnerImageUploadQuota(userId, sid)");
    expect(read("app/api/admin/stores/samples/[id]/upload-image/route.ts")).toContain("enforceStoreOwnerImageUploadQuota(gate.actor.userId, sid)");
  });
  it("HB-4 deleting a banner draft removes its unreferenced files", () => {
    for (const f of ["lib/stores/advertising/owner-banner-writer.ts", "lib/stores/advertising/admin-delivery-ad-writer.ts"]) {
      expect(read(f), f).toContain("removeUnreferencedDeliveryAdBannerAssets(sb, ");
    }
  });
});

describe("HC-1 sample operations use the owner normalization", () => {
  it("builds hours JSON and refuses delivery without a store location", () => {
    const ok = buildAdminSampleOperationsPatch(
      { business_hours_json: {}, lat: 14.5, lng: 121 },
      { deliveryAvailable: true, deliveryFeePhp: "49", minOrderPhp: 300, prepTimeMinutes: 25, openTime: "10:00", closeTime: "22:00" }
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const h = ok.patch.business_hours_json as Record<string, unknown>;
      expect(h).toMatchObject({ delivery_fee_php: 49, min_order_php: 300, prep_time_minutes: 25, delivery_fee_mode: "self" });
      expect(ok.patch.delivery_available).toBe(true);
    }
    expect(buildAdminSampleOperationsPatch({ business_hours_json: {}, lat: null, lng: null }, { deliveryAvailable: true })).toEqual({
      ok: false,
      error: "store_delivery_requires_canonical_geo",
    });
    expect(buildAdminSampleOperationsPatch({ business_hours_json: {}, lat: 1, lng: 1 }, { openTime: "25:00" }).ok).toBe(false);
  });
});

describe("HC-2 service-only stores read 「방문」", () => {
  it("detail summary and bottom bar switch wording only", () => {
    expect(read("components/stores/StoreDetailPublic.tsx")).toContain('products.every((p) => p.item_type === "service")');
    expect(read("components/stores/store-order-detail/StoreOrderHeroSummary.tsx")).toContain('visitService ? "store_visit_tab" : "store_pickup_tab"');
    expect(read("components/stores/StoreDetailBottomStrip.tsx")).toContain('visitService ? "store_bottom_status_visit_open"');
  });
});
