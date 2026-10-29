import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectHeroPlacementSlots } from "@/lib/admin/ads-exposure/hero-placement-slots";
import type { HeroOccupancyCampaign } from "@/lib/admin/ads-exposure/capacity-gate";
import { DELIVERY_HERO_PLACEMENT_KEY } from "@/lib/admin/ads-exposure/capacity-gate";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("v4 실기 확인 결함 DS-01~03", () => {
  it("DS-01 자리표시 문구를 값 없이 번역한 뒤 replace 하지 않는다", () => {
    for (const rel of [
      "components/admin/stores/AdminDeliveryAdPlacementPolicyPanel.tsx",
      "components/stores/advertising/DeliveryAdPolicySlotPreview.tsx",
      "components/stores/advertising/DeliveryAdPlacementPreview.tsx",
      "components/admin/stores/AdminStoresCategoryPolicyPage.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/\.replace\(\s*"\{(n|interval|max|organic)\}"/);
      expect(src, rel).not.toMatch(/t\("admin_delivery_ads_(home|browse)_policy_interval"\)/);
      expect(src, rel).not.toMatch(/t\("delivery_ads_policy_slot_summary"\)/);
    }
  });

  it("DS-02 히어로 슬롯 기간은 PHT (UTC 21:23 → PHT 05:23 다음날)", () => {
    const campaign = {
      id: "e2d3a889-bfdc-4f41-b746-1242cc57f800",
      title: "샘플 광고 · 소담한식",
      storeName: "소담한식",
      lifecycleStatus: "ACTIVE",
      inventoryKeys: [DELIVERY_HERO_PLACEMENT_KEY],
      startAt: "2026-10-28T21:23:42.249Z",
      endAt: "2027-01-26T21:23:00.000Z",
      ownerUserId: null,
      imageUrl: null,
      campaignSource: "ADMIN",
      sortOrder: 1,
    } as unknown as HeroOccupancyCampaign;
    const [slot] = projectHeroPlacementSlots([campaign]);
    expect(slot.scheduleLabel).toBe("2026-10-29 05:23 → 2027-01-27 05:23");
  });

  it("DS-03 광고 집계 함수가 업종 상단 배너를 배너 업종 대상으로 거른다", () => {
    const sql = read("supabase/migrations/20270708150400_admin_ad_page_category_top_primary_ds03.sql");
    const body = sql.split("-- ===== 이전 정의(롤백용) =====")[0];
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_delivery_ad_campaigns_page/);
    expect(body).toMatch(/pr\.inv <> 'STORES_CATEGORY_TOP'/);
    expect(body).toMatch(/b\.browse_primary_slug IS NULL/);
    expect(body).toMatch(/lower\(b\.browse_primary_slug\) = pr\.primary_slug/);
    expect(body).not.toMatch(/GRANT .* TO (anon|authenticated)/i);
  });
});
