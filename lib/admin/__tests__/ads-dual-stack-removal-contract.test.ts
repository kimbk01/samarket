/**
 * Ads dual-stack removal — Delivery Control Plane vs Delivery hub.
 * T1–T10 boundary checks (source + route authority). No Production A–Z.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminMenu } from "@/components/admin/admin-menu";
import {
  DELIVERY_AD_ADMIN_ROUTES,
  DELIVERY_AD_LEGACY_ADMIN_ROUTES,
} from "@/lib/stores/advertising/delivery-ad-routes";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function collectMenuPaths(
  nodes: typeof adminMenu,
  out: { key: string; path?: string }[] = []
): { key: string; path?: string }[] {
  for (const n of nodes) {
    if (typeof n.path === "string") {
      out.push({ key: n.key, path: n.path });
    }
    if (n.children?.length) {
      collectMenuPaths(n.children, out);
    }
  }
  return out;
}

describe("ADS dual-stack removal — Delivery operator authority", () => {
  it("T1/T2: one Delivery ops management route (manage hub + detail writer)", () => {
    expect(DELIVERY_AD_ADMIN_ROUTES.hub).toBe("/admin/delivery-ads/manage");
    expect(DELIVERY_AD_ADMIN_ROUTES.control).toBe("/admin/delivery-ads");
    expect(existsSync(resolve(process.cwd(), "app/admin/delivery-ads/manage/page.tsx"))).toBe(true);
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toContain("/api/admin/delivery-ads/");
    expect(detail).toContain("DELIVERY_AD_ADMIN_ROUTES.hub");
  });

  it("T3/T4: Control Plane is not a Delivery lifecycle writer UI; hub does not remount CP", () => {
    const loader = read("lib/admin/ads-control-plane/load-ads-control-plane.ts");
    expect(loader).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(loader).toContain("No new ads tables");
    expect(loader).toContain("projectDeliveryCampaignToActionItem");
    expect(loader).not.toContain("delivery:${item.caseId}");

    const hub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(hub).not.toContain("AdminAdsExposureControlPlane");

    const controlPage = read("app/admin/delivery-ads/page.tsx");
    expect(controlPage).toContain("AdminAdsExposureControlPlane");
    expect(controlPage).not.toContain("AdminDeliveryAdsControlPlane");
    expect(controlPage).toContain("shouldHandoffToDeliveryHub");

    const legacyInsertions = read("app/admin/store-insertions/page.tsx");
    expect(legacyInsertions).toContain("DELIVERY_AD_ADMIN_ROUTES.hub");
    const legacyBanner = read("app/admin/store-banner-ads/page.tsx");
    expect(legacyBanner).toContain("DELIVERY_AD_ADMIN_ROUTES.hub");
    expect(DELIVERY_AD_LEGACY_ADMIN_ROUTES.canonical).toBe("/admin/delivery-ads/manage");
  });

  it("T5: deep-link builders preserve filters into hub", () => {
    const placement = read("lib/stores/advertising/delivery-ad-placement-language.ts");
    expect(placement).toContain("DELIVERY_AD_ADMIN_ROUTES.hub");
    expect(placement).not.toMatch(/return q \? `\/admin\/delivery-ads\?/);

    const map = read("lib/admin/placement-map-read-model.ts");
    expect(map).toContain("DELIVERY_AD_ADMIN_ROUTES.hub");
    expect(map).toContain("view=actionable");
  });

  it("T6/T7: Ads nav has one Delivery ops leaf; control is separate 관제", () => {
    const paths = collectMenuPaths(adminMenu);
    const deliveryOps = paths.filter((p) => p.path === "/admin/delivery-ads/manage");
    const control = paths.filter((p) => p.path === "/admin/delivery-ads");
    expect(deliveryOps.length).toBe(1);
    expect(deliveryOps[0]?.key).toBe("delivery-ads-ops");
    expect(control.length).toBe(1);
    expect(control[0]?.key).toBe("delivery-ads-control");
    const competing = paths.filter(
      (p) =>
        p.path === "/admin/store-insertions" ||
        p.path === "/admin/store-banner-ads" ||
        p.path === "/admin/banners"
    );
    expect(competing.length).toBe(0);
  });

  it("T8/T9: domain SSOT writers unchanged; detail remains mutation owner", () => {
    expect(existsSync(resolve(process.cwd(), "app/api/admin/delivery-ads/[campaignId]/route.ts"))).toBe(
      true
    );
    expect(existsSync(resolve(process.cwd(), "app/api/admin/delivery-ads/[campaignId]/actions/route.ts"))).toBe(
      true
    );
    expect(DELIVERY_AD_ADMIN_ROUTES.detail("abc")).toBe("/admin/delivery-ads/abc");
  });

  it("T10: Feed / Popup / Promotion operator surfaces untouched by this cut", () => {
    expect(existsSync(resolve(process.cwd(), "app/admin/feed-ads/page.tsx"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "app/admin/platform-popup/page.tsx"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "app/admin/ad-applications/page.tsx"))).toBe(true);
    const hub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(hub).not.toContain("/admin/feed-ads");
    expect(hub).not.toContain("platform-popup");
  });
});
