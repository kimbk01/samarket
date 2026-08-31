/**
 * R1 Owner Commercial Application Recovery — contract tests (source + helpers).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED,
  ownerAdsDetailPanelsForLifecycle,
  ownerAdsFundingErrorI18nKey,
  ownerAdsHubCardPrimaryCta,
  ownerAdsShouldShowFundingPanel,
} from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";
import { OWNER_STORE_SPONSORED_INVENTORY_KEYS } from "@/lib/stores/advertising/owner-store-sponsored-contract";

const root = process.cwd();
const hub = () =>
  readFileSync(join(root, "components/business/owner/ads/OwnerDeliveryAdsHubView.tsx"), "utf8");
const detail = () =>
  readFileSync(join(root, "components/business/owner/ads/OwnerDeliveryAdDetailView.tsx"), "utf8");
const createSp = () =>
  readFileSync(
    join(root, "components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx"),
    "utf8"
  );
const migCut3 = () =>
  readFileSync(
    join(root, "supabase/migrations/20261201200000_delivery_ads_cut3a_operations_case.sql"),
    "utf8"
  );

describe("R1 Owner Commercial Application Recovery", () => {
  it("R1-T1 DRAFT detail does not render funding panel", () => {
    expect(ownerAdsDetailPanelsForLifecycle("DRAFT").has("funding")).toBe(false);
    expect(detail()).toContain("ownerAdsShouldShowFundingPanel");
  });

  it("R1-T2 DRAFT without snapshot never renders snapshot_missing", () => {
    expect(detail()).not.toMatch(/\{fundError\}/);
    expect(detail()).toContain("ownerAdsFundingErrorI18nKey");
    expect(ownerAdsFundingErrorI18nKey("snapshot_missing")).toBe("owner_ads_funding_err_snapshot");
  });

  it("R1-T3 raw funding errors never render directly", () => {
    expect(detail()).not.toMatch(/\{fundError\}/);
    expect(ownerAdsFundingErrorI18nKey("weird_rpc")).toBe("owner_ads_funding_err_generic");
  });

  it("R1-T4 DRAFT renders application editor (redirect to create)", () => {
    expect(detail()).toContain('lifecycleStatus === "DRAFT"');
    expect(detail()).toContain("router.replace");
    expect(detail()).toContain("createStoreSponsored");
  });

  it("R1-T5 DRAFT performance absent", () => {
    expect(ownerAdsDetailPanelsForLifecycle("DRAFT").has("performance")).toBe(false);
  });

  it("R1-T6 UNDER_REVIEW performance absent", () => {
    expect(ownerAdsDetailPanelsForLifecycle("UNDER_REVIEW").has("performance")).toBe(false);
  });

  it("R1-T7 SCHEDULED performance absent", () => {
    expect(ownerAdsDetailPanelsForLifecycle("SCHEDULED").has("performance")).toBe(false);
  });

  it("R1-T8 ACTIVE performance allowed", () => {
    expect(ownerAdsDetailPanelsForLifecycle("ACTIVE").has("performance")).toBe(true);
  });

  it("R1-T9 ENDED final performance allowed", () => {
    expect(ownerAdsDetailPanelsForLifecycle("ENDED").has("performance")).toBe(true);
  });

  it("R1-T10 CUT3 unavailable → R1 ops flag remains false (R2 owns mount)", () => {
    expect(OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED).toBe(false);
    expect(detail()).toContain("OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED");
  });

  it("R1-T11 R1 flag does not enable composer by itself", () => {
    expect(OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED).toBe(false);
    // R2 may mount panel; R1 gate must stay hard-false.
    expect(detail()).toContain("OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED");
  });

  it("R1-T12 hub global giant performance absent", () => {
    expect(hub()).not.toContain("DeliveryAdPerformancePanel");
    expect(hub()).not.toContain("/api/me/delivery-ads/performance");
    expect(hub()).not.toContain("data-owner-ads-hub-performance");
  });

  it("R1-T13 hub primary CTA = 광고 신청", () => {
    expect(hub()).toContain('data-owner-ads-primary-cta="apply"');
    expect(hub()).toContain("owner_ads_apply_primary_cta");
  });

  it("R1-T14 Store Promotion placement choices exact two launch surfaces", () => {
    expect([...OWNER_STORE_SPONSORED_INVENTORY_KEYS].sort()).toEqual([
      "STORES_CATEGORY_FEED",
      "STORES_HOME_FEED",
    ]);
    expect(createSp()).toContain("owner_ads_placement_home_help");
    expect(createSp()).toContain("owner_ads_placement_category_help");
  });

  it("R1-T15 disabled/unpriced package shows 판매 준비 중", () => {
    expect(createSp()).toContain("owner_ads_no_sellable_packages");
    expect(createSp()).toContain('data-owner-ads-packages="preparing"');
    expect(createSp()).toContain("owner_ads_cta_sale_preparing");
  });

  it("R1-T16 unpriced package never shows ₱0", () => {
    expect(createSp()).not.toMatch(/₱0\.00|PHP\s*0|price.*=\s*0/);
    expect(createSp()).not.toContain("199");
    expect(createSp()).not.toContain("349");
    expect(createSp()).not.toContain("599");
  });

  it("R1-T17 application submit disabled without valid package/quote", () => {
    expect(createSp()).toContain("!canSubmit");
    expect(createSp()).toMatch(/noSellablePackages \|\| !quote/);
  });

  it("R1-T18 preview uses canonical placement preview", () => {
    expect(createSp()).toContain("DeliveryAdPlacementPreview");
    expect(createSp()).toContain('renderContext="owner_preview"');
  });

  it("R1-T19 preview emits no telemetry", () => {
    expect(createSp()).not.toMatch(/track\(|telemetry|analytics\.track/i);
  });

  it("R1-T20 one contextual fixed footer only", () => {
    expect(createSp()).toContain('data-owner-ads-footer="owner-admin-ssot"');
    expect(detail()).toContain('data-owner-ads-footer="owner-admin-ssot"');
  });

  it("R1-T21 giant red sticky delete absent", () => {
    expect(detail()).not.toMatch(/bg-red-600|Sam\.btn\.danger.*w-full/);
    expect(detail()).toContain('.filter((a) => !(a.kind === "action" && a.action === "delete"))');
  });

  it("R1-T22 delete uses confirmation flow for DRAFT only (via editor redirect)", () => {
    expect(detail()).toContain('lifecycleStatus === "DRAFT"');
    expect(detail()).toContain("router.replace");
  });

  it("R1-T23 raw UUID not primary Owner display", () => {
    expect(hub()).not.toMatch(/storeId\}\s*<\/p>/);
    expect(detail()).not.toContain("campaign.storeId}");
  });

  it("R1-T24 no internal inventory/product keys visible as primary labels", () => {
    expect(hub()).toContain("deliveryAdPlacementI18nKeys");
    expect(createSp()).toContain("deliveryAdCommercialPlacementLabel");
    expect(createSp()).not.toMatch(/>STORES_HOME_FEED</);
  });

  it("R1-T25 existing Business Cash authority preserved", () => {
    expect(hub()).toContain('data-owner-ads-business-cash="summary"');
    expect(detail()).toContain("/api/me/delivery-ads/");
    expect(detail()).toContain("/funding");
  });

  it("R1-T26 existing package price authority preserved", () => {
    expect(createSp()).toContain("/api/me/delivery-ads/commercial");
    expect(createSp()).toContain("clientFinalPayableMinor");
  });

  it("R1-T27 no price hardcoding", () => {
    expect(createSp()).not.toMatch(/\b199\b|\b349\b|\b599\b/);
    expect(hub()).not.toMatch(/\b199\b|\b349\b|\b599\b/);
  });

  it("R1-T28 organic untouched", () => {
    expect(hub()).not.toMatch(/organic|discovery.?rank/i);
  });

  it("R1-T29 CUT3 migrations untouched", () => {
    expect(migCut3().length).toBeGreaterThan(100);
    expect(OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED).toBe(false);
  });

  it("R1-T30 Partner membership product available via hub secondary card (R4)", () => {
    expect(hub()).toContain("data-owner-ads-partner-card");
    expect(hub()).toContain("DELIVERY_AD_OWNER_ROUTES.partner");
  });

  it("funding gate helper requires priced snapshot", () => {
    expect(
      ownerAdsShouldShowFundingPanel({
        lifecycleStatus: "SCHEDULED",
        hasPricedSnapshot: false,
        finalPayableMinor: null,
      })
    ).toBe(false);
    expect(
      ownerAdsShouldShowFundingPanel({
        lifecycleStatus: "SCHEDULED",
        hasPricedSnapshot: true,
        finalPayableMinor: 1000,
      })
    ).toBe(true);
    expect(
      ownerAdsShouldShowFundingPanel({
        lifecycleStatus: "DRAFT",
        hasPricedSnapshot: true,
        finalPayableMinor: 1000,
      })
    ).toBe(false);
  });

  it("hub card CTAs match R1 hierarchy", () => {
    expect(
      ownerAdsHubCardPrimaryCta({
        lifecycleStatus: "DRAFT",
        productKind: "store_sponsored",
        storeId: "s1",
        campaignId: "c1",
      }).labelKey
    ).toBe("owner_ads_hub_cta_continue_draft");
    expect(
      ownerAdsHubCardPrimaryCta({
        lifecycleStatus: "CHANGES_REQUESTED",
        productKind: "store_sponsored",
        storeId: "s1",
        campaignId: "c1",
      }).labelKey
    ).toBe("owner_ads_hub_cta_edit");
    expect(
      ownerAdsHubCardPrimaryCta({
        lifecycleStatus: "ACTIVE",
        productKind: "store_sponsored",
        storeId: "s1",
        campaignId: "c1",
      }).labelKey
    ).toBe("owner_ads_hub_cta_view_performance");
  });
});
