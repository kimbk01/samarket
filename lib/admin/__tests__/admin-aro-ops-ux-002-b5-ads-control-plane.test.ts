import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { listAllPlacementMapRows } from "@/lib/admin/placement-map-read-model";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("ARO-OPS-UX-002-B5 ads / exposure control plane", () => {
  it("read-model + API + UI exist without new ads SSOT/mutation", () => {
    expect(existsSync(resolve(process.cwd(), "lib/admin/ads-control-plane/load-ads-control-plane.ts"))).toBe(
      true
    );
    expect(existsSync(resolve(process.cwd(), "app/api/admin/ads-control-plane/route.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "components/admin/ads/AdminAdsExposureControlPlane.tsx"))).toBe(
      true
    );

    const loader = read("lib/admin/ads-control-plane/load-ads-control-plane.ts");
    expect(loader).toContain("listDeliveryAdAdminActionQueue");
    expect(loader).toContain("feed_ad_requests");
    expect(loader).toContain("platform_popup_owner_requests");
    expect(loader).toContain('currency: "CASH"');
    expect(loader).toContain('currency: "POINT"');
    expect(loader).toContain("listAllPlacementMapRows");
    expect(loader).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(loader).not.toMatch(/CREATE TABLE|unified_campaign/i);

    const ui = read("components/admin/ads/AdminAdsExposureControlPlane.tsx");
    expect(ui).toContain('data-aro-ops-ux-002-b5="1"');
    expect(ui).toContain("action-required");
    expect(ui).toContain('id="placement-map"');
    expect(ui).toMatch(/노출 위치|Placements/);
    expect(ui).not.toMatch(/캠페인/);
  });

  it("mounts on canonical Delivery Ads hub (no ads-v2)", () => {
    const hub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
    expect(hub).toContain("AdminAdsExposureControlPlane");
    // Control plane mounts before legacy hub summary block.
    expect(hub.indexOf("<AdminAdsExposureControlPlane")).toBeLessThan(
      hub.indexOf("{/* 1 — Page identity / summary */}")
    );
    expect(DELIVERY_AD_ADMIN_ROUTES.hub).toBe("/admin/delivery-ads");
    expect(existsSync(resolve(process.cwd(), "app/admin/ads-v2"))).toBe(false);
  });

  it("keeps Partner / promote separation and billing currency hard rules", () => {
    const loader = read("lib/admin/ads-control-plane/load-ads-control-plane.ts");
    expect(loader).toContain("currency: \"CASH\"");
    expect(loader).toContain("currency: \"POINT\"");
    expect(loader).toMatch(/결제·승인·실제 노출|Payment, approval, and exposure/);
    expect(loader).toMatch(/피드 광고는 Point|Feed Ads bill in Point/);
    expect(loader).toMatch(/거래 홍보는 Point|Trade promote uses Point/);
  });

  it("placement map registry is non-empty and used", () => {
    expect(listAllPlacementMapRows().length).toBeGreaterThan(0);
    const ac = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ac).toContain("#action-required");
    expect(ac).toContain("/admin/ad-applications?domain=feed");
  });
});
