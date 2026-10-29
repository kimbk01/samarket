/**
 * 배달 묶음 2 — 배너·광고 (docs/audit/delivery-audit-2026-10-29.md §4-3).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bannerBrowseTargetMatchesPage,
  bannerBrowseTargetsOverlap,
  parseBannerBrowseTarget,
} from "@/lib/stores/advertising/banner-browse-target";
import { assertHeroCapacityForWindow } from "@/lib/admin/ads-exposure/capacity-gate";
import { bannerPixelGuideForInventory } from "@/lib/stores/advertising/delivery-ad-open-event-commercial";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("B-01 업종 대상", () => {
  it("대상 없음 = 전체 업종, 1차 지정 = 그 1차의 모든 페이지, 2차 지정 = 그 2차 페이지만", () => {
    const all = parseBannerBrowseTarget({});
    const food = parseBannerBrowseTarget({ browse_primary_slug: "restaurant" });
    const pizza = parseBannerBrowseTarget({ browse_primary_slug: "restaurant", browse_secondary_slug: "pizza" });
    expect(bannerBrowseTargetMatchesPage(all, { primarySlug: "cafe", subSlug: null })).toBe(true);
    expect(bannerBrowseTargetMatchesPage(food, { primarySlug: "cafe", subSlug: null })).toBe(false);
    expect(bannerBrowseTargetMatchesPage(food, { primarySlug: "restaurant", subSlug: "pizza" })).toBe(true);
    expect(bannerBrowseTargetMatchesPage(pizza, { primarySlug: "restaurant", subSlug: null })).toBe(false);
    expect(bannerBrowseTargetMatchesPage(pizza, { primarySlug: "restaurant", subSlug: "pizza" })).toBe(true);
  });
  it("2차만 있고 1차가 없으면 2차 무시", () => {
    expect(parseBannerBrowseTarget({ browse_secondary_slug: "pizza" })).toEqual({ primarySlug: null, secondarySlug: null });
  });
});

describe("B-02 업종 상단 수용량 = 같은 업종 페이지 기준", () => {
  const camp = (id: string, primary: string | null) => ({
    id,
    storeId: null,
    storeName: id,
    title: id,
    inventoryKeys: ["STORES_CATEGORY_TOP"],
    lifecycleStatus: "ACTIVE",
    startAt: "2026-10-01T00:00:00.000Z",
    endAt: "2027-01-01T00:00:00.000Z",
    creativeId: null,
    browseTarget: { primarySlug: primary, secondarySlug: null },
  });
  it("다른 업종 대상은 서로 점유하지 않는다, 전체 대상은 모든 업종을 점유", () => {
    const campaigns = ["a", "b", "c"].map((id) => camp(id, "restaurant"));
    const target = { primarySlug: "cafe", secondarySlug: null };
    const ok = assertHeroCapacityForWindow({
      campaigns,
      startAt: "2026-11-01T00:00:00.000Z",
      endAt: "2026-11-02T00:00:00.000Z",
      capacity: 3,
      placementKey: "STORES_CATEGORY_TOP",
      occupiesSamePool: (c) => bannerBrowseTargetsOverlap((c as ReturnType<typeof camp>).browseTarget, target),
    });
    expect(ok.ok).toBe(true);
    const full = assertHeroCapacityForWindow({
      campaigns,
      startAt: "2026-11-01T00:00:00.000Z",
      endAt: "2026-11-02T00:00:00.000Z",
      capacity: 3,
      placementKey: "STORES_CATEGORY_TOP",
      occupiesSamePool: (c) =>
        bannerBrowseTargetsOverlap((c as ReturnType<typeof camp>).browseTarget, {
          primarySlug: "restaurant",
          secondarySlug: null,
        }),
    });
    expect(full.ok).toBe(false);
  });
});

describe("B-03·B-05·B-07·B-08·B-10 구조", () => {
  it("2:1 지면 이미지 가이드가 있다", () => {
    expect(bannerPixelGuideForInventory("STORES_CATEGORY_TOP")?.ratioLabel).toBe("2:1");
    expect(bannerPixelGuideForInventory("STORES_HOME_INLINE_1")?.ratioLabel).toBe("2:1");
  });
  it("히어로 순서는 원자 RPC 로만 저장", () => {
    const src = read("lib/admin/ads-exposure/reorder-hero-banners.ts");
    expect(src).toContain('sb.rpc("reorder_store_banner_hero_slides"');
    expect(src).not.toContain(".update(");
  });
  it("히어로 슬라이드 전환 애니메이션·새로고침 연결, 광고 인스턴스는 현재 슬라이드 1개", () => {
    const src = read("components/stores/home/hub/StoresHomeHeroBanner.tsx");
    expect(src).toContain("stores-home-hero-slide-in-next");
    expect(src).toContain("[refreshKey]");
    expect(src.match(/<DeliveryAdBanner/g)?.length).toBe(1);
  });
  it("샘플 매장 배너는 샘플 광고 라벨", () => {
    for (const f of [
      "components/stores/home/hub/StoresHomeHeroBanner.tsx",
      "components/stores/home/hub/StoresHomeBeforeRestBanner.tsx",
      "components/stores/browse/StoresBrowseTopBanner.tsx",
    ]) {
      expect(read(f)).toContain('slide.isSampleStore ? t("store_insertion_sample_ad")');
    }
  });
});
