/**
 * P0-B Admin commercial settings — targeted contract tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS,
  deliveryAdCommercialPlacementLabel,
  formatDeliveryAdPhpMinor,
  parseDeliveryAdPhpMajorToMinor,
} from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import {
  assertCampaignCommercialSnapshotImmutable,
  calculateDeliveryAdCommercialQuote,
  calculateDeliveryAdExtensionQuote,
  type DeliveryAdPackageRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("P0-B Admin delivery ad commercial settings", () => {
  it("T1 — Admin settings route + component exist", () => {
    expect(DELIVERY_AD_ADMIN_ROUTES.commercialSettings).toBe(
      "/admin/delivery-ads/commercial-settings"
    );
    expect(read("app/admin/delivery-ads/commercial-settings/page.tsx")).toContain(
      "AdminDeliveryAdCommercialSettingsView"
    );
    expect(
      read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx")
    ).toContain("/api/admin/delivery-ads/commercial");
  });

  it("T2/T3 — package price & duration go through admin writer API ops", () => {
    const api = read("app/api/admin/delivery-ads/commercial/route.ts");
    expect(api).toContain("update_package");
    expect(api).toContain("adminUpdateDeliveryAdPackagePrice");
    expect(api).toContain("durationDays");
    const writer = read("lib/stores/advertising/delivery-ad-commercial-admin-writer.ts");
    expect(writer).toContain("price_required_to_enable");
  });

  it("T4 — custom package create supported", () => {
    expect(read("app/api/admin/delivery-ads/commercial/route.ts")).toContain("create_package");
    expect(
      read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx")
    ).toContain("create_package");
  });

  it("T5 — disabled package not sellable", () => {
    const pkg: DeliveryAdPackageRow = {
      id: "1",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      code: "7_day",
      displayName: "7",
      durationDays: 7,
      priceAmountMinor: 1000,
      currency: "PHP",
      enabled: false,
      displayOrder: 1,
    };
    expect(
      calculateDeliveryAdCommercialQuote({
        productKind: "store_sponsored",
        inventoryKey: "STORES_HOME_FEED",
        package: pkg,
        placement: {
          productKind: "store_sponsored",
          inventoryKey: "STORES_HOME_FEED",
          sellable: true,
        },
        productEnabled: true,
        acceptingApplications: true,
        partner: {
          membershipId: null,
          active: false,
          advertisingDiscountPercent: 0,
          benefitSnapshot: {},
        },
      })
    ).toEqual({ ok: false, error: "package_disabled" });
  });

  it("T6 — placement sellable authority", () => {
    const api = read("app/api/admin/delivery-ads/commercial/route.ts");
    expect(api).toContain("update_placement");
    expect(api).toContain("adminSetPlacementSellable");
  });

  it("T7 — max/interval exposure authority untouched", () => {
    const ui = read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx");
    expect(ui).not.toMatch(/intervalEvery|maxInsertion|max_insertion/);
    expect(ui).toContain("Exposure (max/interval) policy");
  });

  it("T8/T9 — Partner fee + discount validation path", () => {
    const api = read("app/api/admin/delivery-ads/commercial/route.ts");
    expect(api).toContain("update_partner");
    expect(api).toContain("advertisingDiscountPercent");
    const writer = read("lib/stores/advertising/delivery-ad-commercial-admin-writer.ts");
    expect(writer).toContain("invalid_discount");
  });

  it("T10 — organic ranking untouched", () => {
    const ui = read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx");
    expect(ui).toMatch(/organic ranking/i);
    expect(ui).not.toMatch(/boostOrganic|rankingScore/);
  });

  it("T11 — historical snapshot not mutated by catalog helpers", () => {
    const snap = {
      campaignId: "c",
      productKind: "store_sponsored" as const,
      campaignSource: "OWNER_PAID" as const,
      inventoryKey: "STORES_HOME_FEED",
      packageId: "p",
      packageCode: "7_day",
      packageDisplayName: "7",
      durationDaysSnapshot: 7,
      basePriceMinorSnapshot: 1000,
      partnerMembershipId: null,
      partnerDiscountPercentSnapshot: 0,
      partnerBenefitSnapshot: {},
      finalPayableMinor: 1000,
      currency: "PHP",
      pricedAt: "2026-01-01T00:00:00.000Z",
      commercialStatus: "PRICED" as const,
    };
    expect(assertCampaignCommercialSnapshotImmutable(snap, { ...snap })).toBe(true);
    expect(
      assertCampaignCommercialSnapshotImmutable(snap, { ...snap, finalPayableMinor: 2 })
    ).toBe(false);
  });

  it("T12 — invalid price/duration fail helpers", () => {
    expect(parseDeliveryAdPhpMajorToMinor("-1")).toBeNull();
    expect(parseDeliveryAdPhpMajorToMinor("1.234")).toBeNull();
    expect(parseDeliveryAdPhpMajorToMinor("10.50")).toBe(1050);
    expect(formatDeliveryAdPhpMinor(1050)).toContain("10.50");
  });

  it("T13 — client cannot bypass server commercial validation", () => {
    const api = read("app/api/admin/delivery-ads/commercial/route.ts");
    expect(api).toContain("requireAdminApiUser");
    expect(api).toContain("adminUpdateDeliveryAdPackagePrice");
    expect(api).not.toMatch(/from\("delivery_ad_packages"\).*insert/);
  });

  it("T14 — Korean/customer placement labels map to inventory", () => {
    expect(deliveryAdCommercialPlacementLabel("STORES_HOME_FEED", "ko")).toBe(
      "배달 홈 매장 목록"
    );
    expect(deliveryAdCommercialPlacementLabel("STORES_HOME_HERO", "ko")).toBe(
      "배달 홈 상단 배너"
    );
    expect(DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS.STORES_SEARCH_TOP.ko).toContain("검색");
  });

  it("T15 — responsive / tablet contract markers", () => {
    const ui = read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx");
    expect(ui).toMatch(/sm:grid-cols/);
    expect(ui).toContain("min-w-0");
  });

  it("extension calculator still fail-closed when disabled", () => {
    expect(
      calculateDeliveryAdExtensionQuote({
        policy: {
          extensionEnabled: false,
          additionalDayPriceMinor: 100,
          currency: "PHP",
          minimumExtensionDays: 1,
          maximumExtensionDays: 10,
          extensionUnitDays: 1,
        },
        requestedDays: 2,
        previousEndAtIso: "2026-09-01T00:00:00.000Z",
      })
    ).toEqual({ ok: false, error: "extension_disabled" });
  });

  it("Owner ads UI files not imported by commercial settings", () => {
    const ui = read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx");
    expect(ui).not.toContain("OwnerDeliveryAdsHubView");
    expect(ui).not.toContain("OwnerBannerCreateView");
  });
});
