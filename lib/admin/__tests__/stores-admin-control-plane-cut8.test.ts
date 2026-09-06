import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminMenu, collectAdminMenuPathEntries } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { DELIVERY_CMS_SIDEBAR, isDeliveryCmsSurface } from "@/lib/admin/delivery-cms-nav";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";
import { STORE_DISCOVERY_CAMPAIGN_TABLE } from "@/lib/stores/store-discovery-campaign-authority";
import { planStoresBrowseInsertions } from "@/lib/stores/composition/stores-composition-insertion-live";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import {
  createStoreBannerAdCampaignAdmin,
  parseStoreBannerAdCampaignCreateBody,
} from "@/lib/stores/store-banner-ad-campaign-writer";
import { resolveStoreBannerAdVisibility } from "@/lib/stores/store-banner-ad-exposure";
import { resolveStorePaidAdCampaignExposure } from "@/lib/stores/store-paid-ad-exposure";

function findByKey(key: string) {
  return findAdminMenuByKey(adminMenu, key) ?? null;
}

describe("CUT 8 Admin Control Plane", () => {
  it("T1 one canonical Admin nav owner", () => {
    expect(collectAdminMenuPathEntries(adminMenu).length).toBeGreaterThan(10);
    expect(isDeliveryCmsSurface("/admin/stores-home-shelves")).toBe(false);
  });

  it("T2 duplicate right rail removed", () => {
    expect(DELIVERY_CMS_SIDEBAR).toEqual([]);
    const rightMenu = readFileSync(
      join(process.cwd(), "components/admin/shell/AdminDeliveryCmsRightMenu.tsx"),
      "utf8"
    );
    expect(rightMenu).toMatch(/DELIVERY_CMS_SIDEBAR/);
  });

  it("T3 taxonomy menu → taxonomy writer", () => {
    expect(findByKey("stores-industry-primary")?.path).toContain(
      "/admin/stores/application-settings?menu=stores"
    );
    expect(findByKey("stores-industry-secondary")?.path).toContain("focus=topic");
    const taxApi = readFileSync(
      join(process.cwd(), "app/api/admin/stores/taxonomy/route.ts"),
      "utf8"
    );
    expect(taxApi).toMatch(/store_categories|store_topics/);
  });

  it("T4 Browse menu → scope-policy writer only", () => {
    expect(findByKey("stores-browse-policy")?.path).toBe("/admin/stores-category-policy");
    const api = readFileSync(
      join(process.cwd(), "app/api/admin/stores-category-policy/route.ts"),
      "utf8"
    );
    expect(api).toMatch(/store_browse_scope_policy|browse.?scope/i);
  });

  it("T5 HOME menu → composition policy", () => {
    expect(findByKey("stores-home-shelves")?.path).toBe("/admin/stores-home-shelves");
    const api = readFileSync(
      join(process.cwd(), "app/api/admin/stores-home-shelves/route.ts"),
      "utf8"
    );
    expect(api).toMatch(/store_composition_policy_overrides|composition/);
  });

  it("T6 Paid Ads → Delivery Ads control plane (legacy insertions redirected)", () => {
    expect(findByKey("delivery-ads-control")?.path).toBe("/admin/delivery-ads");
    expect(findByKey("store-ads-control")).toBeNull();
    expect(STORE_PAID_AD_CAMPAIGN_TABLE).toBe("store_paid_ad_campaigns");
    const api = readFileSync(join(process.cwd(), "app/api/admin/store-paid-ads/route.ts"), "utf8");
    expect(api).toMatch(/legacy_writer_disabled/);
    expect(api).toMatch(/status: 410/);
    expect(api).toMatch(/resolveStorePaidAdCampaignExposure/);
    const page = readFileSync(
      join(process.cwd(), "app/admin/store-insertions/page.tsx"),
      "utf8"
    );
    expect(page).toMatch(/delivery-ads|DELIVERY_AD_ADMIN_ROUTES/);
  });

  it("T7 Paid exposure status consumes canonical resolver", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: {
        id: "p1",
        storeId: "s1",
        placement: "stores_home",
        title: "t",
        headline: "h",
        bodyCopy: null,
        imageUrl: null,
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-12-01T00:00:00.000Z",
        isActive: true,
      },
      nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
      targetPlacement: "stores_home",
      surfaceAllowed: false,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("surfaceAllowed");
  });

  it("T8 Banner Ads → Delivery Ads control plane (legacy banner redirected)", () => {
    expect(findByKey("delivery-ads-control")?.path).toBe("/admin/delivery-ads");
    expect(findByKey("store-banner-ads-control")).toBeNull();
    expect(STORE_BANNER_AD_CAMPAIGN_TABLE).toBe("store_banner_ad_campaigns");
    const api = readFileSync(join(process.cwd(), "app/api/admin/store-banner-ads/route.ts"), "utf8");
    expect(api).toMatch(/legacy_writer_disabled/);
    expect(api).toMatch(/status: 410/);
    expect(api).toMatch(/resolveStoreBannerAdVisibility/);
    expect(typeof createStoreBannerAdCampaignAdmin).toBe("function");
    const parsed = parseStoreBannerAdCampaignCreateBody({
      surface: "stores_home_hero",
      imageUrl: "https://example.com/b.png",
      startAt: "2026-06-01T00:00:00.000Z",
      endAt: "2026-07-01T00:00:00.000Z",
    });
    expect(parsed.ok).toBe(true);
    const page = readFileSync(
      join(process.cwd(), "app/admin/store-banner-ads/page.tsx"),
      "utf8"
    );
    expect(page).toMatch(/delivery-ads|DELIVERY_AD_ADMIN_ROUTES/);
  });

  it("T9 Banner status consumes canonical resolver", () => {
    const vis = resolveStoreBannerAdVisibility({
      campaign: {
        id: "b1",
        surface: "stores_home_hero",
        title: "t",
        subtitle: null,
        imageUrl: "https://x/y.png",
        ctaHref: "/stores",
        sortOrder: 0,
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-02-01T00:00:00.000Z",
        isActive: true,
      },
      nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
      targetSurface: "stores_home_hero",
    });
    expect(vis.visible).toBe(false);
    expect(vis.blockingReasons).toContain("windowActive");
  });

  it("T10 Coupons → coupon control center, not insertions writer", () => {
    expect(findByKey("store-coupon-control-center")?.path).toBe("/admin/store-coupon-control");
    expect(findByKey("store-coupons-control")).toBeNull();
    expect(STORE_COUPON_CAMPAIGN_TABLE).toBe("store_coupon_campaigns");
  });

  it("T11 coupon surface permission ≠ campaign", () => {
    const page = readFileSync(
      join(process.cwd(), "components/admin/stores/AdminStoresCategoryPolicyPage.tsx"),
      "utf8"
    );
    expect(page).toMatch(/쿠폰 배지 허용|Allow coupon badges/);
    expect(page).toMatch(/캠페인 생성은/);
    expect(findByKey("store-coupon-control-center")?.path).not.toBe(
      findByKey("stores-browse-policy")?.path
    );
  });

  it("T12 coupon paid-style browse insertion removed", () => {
    const plan = planStoresBrowseInsertions({
      organicStoreIds: ["a", "b", "c", "d"],
      paidAds: [],
      coupons: [
        {
          id: "c1",
          storeId: "b",
          title: "x",
          discountType: "percent",
          discountValue: 10,
          minOrderAmount: null,
          termsCopy: null,
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: "2026-12-01T00:00:00.000Z",
          isActive: true,
        },
      ],
      policy: STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
        r.slot === "future_coupon_insertion"
          ? { ...r, enabled: true, max: 2, interval: { consumed: true as const, everyN: 2 } }
          : r
      ),
    });
    expect(plan.couponCount).toBe(0);
    expect(plan.rows.every((r) => r.kind !== "coupon")).toBe(true);
    expect(plan.organicIds).toEqual(["a", "b", "c", "d"]);
  });

  it("T13 Editorial Promotions → discovery campaign writer", () => {
    expect(findByKey("store-promo-control")?.path).toBe("/admin/store-discovery");
    expect(STORE_DISCOVERY_CAMPAIGN_TABLE).toBe("store_discovery_campaigns");
  });

  it("T14 Delivery Fee Benefit not campaign", () => {
    const leaves = collectAdminMenuPathEntries(adminMenu);
    expect(leaves.every((e) => !/delivery.?fee|fee.?benefit/i.test(e.key))).toBe(true);
  });

  it("T15 dead/shell controls absent", () => {
    const page = readFileSync(
      join(process.cwd(), "components/admin/stores/AdminStoresCategoryPolicyPage.tsx"),
      "utf8"
    );
    expect(page).not.toMatch(/id: "card"/);
    expect(findByKey("store-insertions-control")).toBeNull();
  });

  it("T16 one authority per Admin domain", () => {
    const paths = collectAdminMenuPathEntries(adminMenu).map((e) => e.path);
    const counts = new Map<string, number>();
    for (const p of paths) counts.set(p, (counts.get(p) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1);
    expect(dupes).toEqual([]);
    expect(findByKey("delivery-ads-control")?.path).toBe("/admin/delivery-ads");
    expect(findByKey("store-ads-control")).toBeNull();
    expect(findByKey("store-banner-ads-control")).toBeNull();
  });

  it("T17 closed runtime authorities unchanged (spot)", () => {
    const eligibility = readFileSync(
      join(process.cwd(), "lib/stores/store-coupon-eligibility.ts"),
      "utf8"
    );
    expect(eligibility).toMatch(/selectDiscoveryEligibleStoreCoupons/);
    const exposure = readFileSync(
      join(process.cwd(), "lib/stores/store-paid-ad-exposure.ts"),
      "utf8"
    );
    expect(exposure).toMatch(/deriveStoresDiscoveryPaidAdExposureState/);
    const browseBuild = readFileSync(
      join(process.cwd(), "lib/stores/stores-browse-build.ts"),
      "utf8"
    );
    expect(browseBuild).not.toMatch(/store_discovery_campaigns/);
  });
});
