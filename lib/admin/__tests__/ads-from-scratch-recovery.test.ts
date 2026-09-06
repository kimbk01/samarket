/**
 * Ads recovery — Approve CTA contrast + Feed→Banner naming + save notice markers.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAdsTestFixtureLabel } from "@/lib/admin/ads-operator/ads-operator-presentation";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { adminMenu } from "@/components/admin/admin-menu";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("ads from-scratch recovery contracts", () => {
  it("Approve CTA uses sam-primary (not undefined sam-brand)", () => {
    const src = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(src).toContain("bg-sam-primary text-sam-on-primary");
    expect(src).not.toMatch(/action === \"approve\"[\s\S]{0,80}bg-sam-brand/);
  });

  it("Popup and Banner save expose success notice after persist+reload", () => {
    const popup = read("components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx");
    expect(popup).toContain("setSaveNotice");
    expect(popup).toContain("data-admin-popup-save-notice");
    expect(popup).toContain("await load()");
    const banner = read("components/admin/stores/AdminDeliveryAdBannerStudioView.tsx");
    expect(banner).toContain("data-admin-banner-save-notice");
    expect(banner).toContain("배너 소재가 저장되었습니다");
  });

  it("Ads menu FINAL LOCK: advertising workspace + products; Feed labeled as Banner ad", () => {
    const adsKids = (findAdminMenuByKey(adminMenu, "ads")?.children ?? []).map((c) => c.key);
    expect(adsKids).toEqual(["ads-advertising-workspace", "ads-products-group"]);
    expect(findAdminMenuByKey(adminMenu, "ads-advertising-workspace")?.path).toBe(
      "/admin/advertising"
    );
    expect(findAdminMenuByKey(adminMenu, "ads-feed-products")?.path).toBe(
      "/admin/feed-ad-products"
    );
    expect(findAdminMenuByKey(adminMenu, "delivery-ads-commercial")?.path).toBe(
      "/admin/delivery-ads/commercial-settings"
    );
    expect(findAdminMenuByKey(adminMenu, "ads-feed-applications")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "ads-applications-group")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "ads-execution-group")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "ads-legacy")).toBeUndefined();
    const ko = read("lib/i18n/catalog/admin.ts");
    expect(ko).toContain('admin_menu_ads_feed_applications: "배너 광고 신청"');
    expect(ko).toContain('admin_menu_ads_feed: "배너 광고 집행"');
    expect(ko).not.toContain('admin_menu_ads_feed_applications: "피드 광고 신청"');
  });

  it("test fixture detector catches PROD_ and [테스트]", () => {
    expect(isAdsTestFixtureLabel("[테스트] currency-prod-e2e-1")).toBe(true);
    expect(isAdsTestFixtureLabel("PROD_1788232269830_1x3ydc")).toBe(true);
    expect(isAdsTestFixtureLabel("나의 오른손떡방")).toBe(false);
  });

  it("control plane defaults to ops data filter", () => {
    const src = read("components/admin/ads/AdminAdsExposureControlPlane.tsx");
    expect(src).toContain('useState<OpsDataFilter>("ops")');
    expect(src).toContain("data-admin-ads-data-filter");
  });
});
