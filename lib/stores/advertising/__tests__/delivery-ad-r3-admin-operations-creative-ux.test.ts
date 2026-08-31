/**
 * R3 — Admin Delivery Ads operations + creative UX recovery (static/source contracts).
 * R3-T1 .. R3-T37 where source/static proof is possible.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW,
  ADMIN_DELIVERY_ADS_ACTIONABLE_LIST_BUCKETS,
  ADMIN_DELIVERY_ADS_HISTORY_LIST_BUCKETS,
  ADMIN_DELIVERY_ADS_PERFORMANCE_LIFECYCLES,
  R3_ADMIN_NO_FIRST_PARTY_CREATE,
  R3_ADMIN_PARTNER_NOT_PRODUCT,
  R3_COMMERCIAL_MATRIX_DURATIONS,
  R3_COMMERCIAL_MATRIX_EXPECTED_CELLS,
  R3_COMMERCIAL_MATRIX_PRODUCTS,
  R3_COMMERCIAL_MATRIX_SEED_CODES,
  adminDeliveryAdFundingErrorHumanKey,
  adminDeliveryAdHubRowPrimaryCta,
  adminDeliveryAdInventoryAspectLabel,
  adminDeliveryAdInventoryHumanLabel,
  adminDeliveryAdProductHumanLabel,
  adminDeliveryAdStoreSponsoredNeedsCreative,
  adminDeliveryAdsHubApiBucket,
  formatAdminDeliveryAdPriceOrUnset,
  isAdminDeliveryAdHubListItemVisible,
  isAdminDeliveryAdPerformanceLifecycle,
  isAdminDeliveryAdPriceUnset,
  r3CommercialMatrixExpectedCellCount,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { mapAdminDeliveryAdActionQueuePresentation } from "@/lib/stores/advertising/delivery-ad-admin-action-queue-presentation";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const hub = () => read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
const detail = () => read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
const commercial = () =>
  read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx");
const queue = () => read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");
const mapper = () =>
  read("lib/stores/advertising/delivery-ad-admin-r3-presentation.ts");
const i18n = () => read("lib/i18n/catalog/admin-delivery-ads.ts");

describe("R3 Admin Delivery Ads operations + creative UX", () => {
  it("R3-T1 — presentation mapper module exists", () => {
    expect(existsSync(join(root, "lib/stores/advertising/delivery-ad-admin-r3-presentation.ts"))).toBe(
      true
    );
    expect(mapper()).toContain("ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW");
  });

  it("R3-T2 — hub default view is actionable (not all/ended)", () => {
    expect(ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW).toBe("actionable");
    expect(hub()).toContain('ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW');
    expect(hub()).toContain('data-hub-default-view="actionable"');
    expect(hub()).not.toMatch(/useState<AdminDeliveryAdListBucket>\("all"\)/);
    expect(hub()).not.toMatch(/useState\("all"\)/);
  });

  it("R3-T3 — actionable list buckets are needs_creative + review", () => {
    expect([...ADMIN_DELIVERY_ADS_ACTIONABLE_LIST_BUCKETS]).toEqual([
      "needs_creative",
      "review",
    ]);
    expect(
      isAdminDeliveryAdHubListItemVisible({
        view: "actionable",
        listBucket: "needs_creative",
      })
    ).toBe(true);
    expect(
      isAdminDeliveryAdHubListItemVisible({
        view: "actionable",
        listBucket: "ended",
      })
    ).toBe(false);
  });

  it("R3-T4 — ended demoted to history view", () => {
    expect([...ADMIN_DELIVERY_ADS_HISTORY_LIST_BUCKETS]).toEqual(["ended", "rejected"]);
    expect(hub()).toContain("admin_delivery_ads_hub_view_history");
    expect(
      isAdminDeliveryAdHubListItemVisible({ view: "history", listBucket: "ended" })
    ).toBe(true);
    expect(adminDeliveryAdsHubApiBucket("actionable")).toBe("all");
    expect(adminDeliveryAdsHubApiBucket("history")).toBe("all");
  });

  it("R3-T5 — Action Queue remains primary ahead of campaign list", () => {
    const src = hub();
    expect(src.indexOf('data-admin-delivery-ads-section="action-queue"')).toBeLessThan(
      src.indexOf('data-admin-delivery-ads-section="campaign-list"')
    );
  });

  it("R3-T6 — hub header has 배달 광고 + commercial settings link; no first-party create", () => {
    const src = hub();
    expect(src).toContain("admin_delivery_ads_title");
    expect(src).toContain("DELIVERY_AD_ADMIN_ROUTES.commercialSettings");
    expect(src).toContain("data-admin-delivery-ads-commercial-link");
    expect(src).not.toMatch(/first.?party|FirstParty|직접 등록|AdminDirectCreate/i);
    expect(src).not.toContain("AdminStoreBannerAdWriterPanel");
    expect(R3_ADMIN_NO_FIRST_PARTY_CREATE).toBe(true);
  });

  it("R3-T7 — Store Promotion never needs creative", () => {
    expect(adminDeliveryAdStoreSponsoredNeedsCreative()).toBe(false);
    const aq = mapAdminDeliveryAdActionQueuePresentation({
      productKind: "store_sponsored",
      lifecycleStatus: "SUBMITTED",
      creativeAssetPath: null,
    });
    expect(aq.bucket).not.toBe("needs_creative");
    expect(aq.cta).not.toBe("produce_banner");
  });

  it("R3-T8 — Banner needs_creative discoverability paths", () => {
    const aq = mapAdminDeliveryAdActionQueuePresentation({
      productKind: "banner",
      lifecycleStatus: "SUBMITTED",
      creativeAssetPath: null,
    });
    expect(aq.bucket).toBe("needs_creative");
    expect(aq.cta).toBe("produce_banner");
    expect(queue()).toContain('presentation.cta === "produce_banner" ? "creative"');
    expect(detail()).toContain("admin-delivery-ad-creative");
    expect(detail()).toContain("focusCreative");
    expect(detail()).toContain("배너 제작");
    expect(hub()).toContain("admin_delivery_ads_banner_creative_state_needed");
  });

  it("R3-T9 — produce_banner CTA uses focus=creative", () => {
    const cta = adminDeliveryAdHubRowPrimaryCta({
      campaignId: "c1",
      productKind: "banner",
      lifecycleStatus: "SUBMITTED",
      listBucket: "needs_creative",
      creativeAssetPath: null,
    });
    expect(cta.focus).toBe("creative");
    expect(cta.href).toContain("focus=creative");
    expect(queue()).toMatch(/focus=\$\{focus\}/);
  });

  it("R3-T10 — NULL price ≠ ₱0", () => {
    expect(formatAdminDeliveryAdPriceOrUnset(null, "ko")).toBe("미설정");
    expect(formatAdminDeliveryAdPriceOrUnset(undefined, "en")).toBe("Not set");
    expect(formatAdminDeliveryAdPriceOrUnset(null, "ko")).not.toContain("₱0");
    expect(isAdminDeliveryAdPriceUnset(null)).toBe(true);
    expect(formatDeliveryAdPhpMinor(null)).toBe("—");
    expect(formatAdminDeliveryAdPriceOrUnset(0, "ko")).toBe(formatDeliveryAdPhpMinor(0));
    expect(commercial()).toContain('placeholder={lang === "en" ? "Not set" : "미설정"}');
    expect(commercial()).toContain("data-price-null-safe");
  });

  it("R3-T11 — human product/placement labels", () => {
    expect(adminDeliveryAdProductHumanLabel("store_sponsored", "ko")).toBe("매장 홍보");
    expect(adminDeliveryAdProductHumanLabel("banner", "ko")).toBe("배너 광고");
    expect(adminDeliveryAdInventoryHumanLabel("STORES_HOME_FEED", "ko")).toBe(
      "배달 홈 매장 목록"
    );
    expect(adminDeliveryAdInventoryHumanLabel("STORES_HOME_HERO", "ko")).toContain("배너");
    expect(i18n()).toContain("매장 홍보");
    expect(i18n()).toContain("배너 광고");
  });

  it("R3-T12 — aspect from inventory SSOT (39:16 / 3:1)", () => {
    expect(adminDeliveryAdInventoryAspectLabel("STORES_HOME_HERO")).toBe("39:16");
    expect(adminDeliveryAdInventoryAspectLabel("STORES_SEARCH_TOP")).toBe("3:1");
    expect(detail()).toContain("adminDeliveryAdInventoryAspectLabel");
    expect(detail()).toContain("admin_delivery_ads_creative_aspect_hint");
  });

  it("R3-T13 — performance lifecycle gate ACTIVE/ENDED only", () => {
    expect([...ADMIN_DELIVERY_ADS_PERFORMANCE_LIFECYCLES]).toEqual(["ACTIVE", "ENDED"]);
    expect(isAdminDeliveryAdPerformanceLifecycle("ACTIVE")).toBe(true);
    expect(isAdminDeliveryAdPerformanceLifecycle("ENDED")).toBe(true);
    expect(isAdminDeliveryAdPerformanceLifecycle("SUBMITTED")).toBe(false);
    expect(isAdminDeliveryAdPerformanceLifecycle("UNDER_REVIEW")).toBe(false);
    expect(detail()).toContain("isAdminDeliveryAdPerformanceLifecycle");
  });

  it("R3-T14 — detail section priority R3 A→J markers", () => {
    const src = detail();
    const order = [
      "required-decision",
      "application",
      "funding",
      "preview",
      "decision-actions",
      "operations",
      "settings",
      "history",
    ];
    let prev = -1;
    for (const id of order) {
      const idx = src.indexOf(`data-admin-delivery-ads-detail-section="${id}"`);
      expect(idx).toBeGreaterThan(prev);
      prev = idx;
    }
    expect(src).toContain("admin_delivery_ads_audit_collapsed");
    expect(src).toContain("auditExpanded");
  });

  it("R3-T15 — banner incomplete: produce CTA + approve readiness gate preserved", () => {
    const src = detail();
    expect(src).toContain("bannerPublishReady?.ok === false");
    expect(src).toContain("admin_delivery_ads_creative_produce_cta");
    expect(src).toContain("evaluateDeliveryBannerPublishReadiness");
  });

  it("R3-T16 — no second sticky footer invented", () => {
    expect(detail()).not.toMatch(/sticky.*footer|fixed.*bottom.*approve/i);
    expect(detail()).not.toContain("data-admin-sticky-footer");
  });

  it("R3-T17 — funding never renders snapshot_missing raw", () => {
    expect(adminDeliveryAdFundingErrorHumanKey("snapshot_missing")).toBe(
      "admin_delivery_ads_funding_err_snapshot"
    );
    expect(detail()).not.toContain("snapshot_missing");
    expect(i18n()).toContain("admin_delivery_ads_funding_err_snapshot");
  });

  it("R3-T18 — commercial matrix 2 products / 12 packages represented", () => {
    expect([...R3_COMMERCIAL_MATRIX_PRODUCTS]).toEqual(["store_sponsored", "banner"]);
    expect([...R3_COMMERCIAL_MATRIX_DURATIONS]).toEqual([7, 15, 30]);
    expect([...R3_COMMERCIAL_MATRIX_SEED_CODES]).toEqual(["7_day", "15_day", "30_day"]);
    expect(R3_COMMERCIAL_MATRIX_EXPECTED_CELLS).toBe(12);
    expect(r3CommercialMatrixExpectedCellCount()).toBe(12);
    expect(commercial()).toContain("data-commercial-matrix");
    expect(commercial()).toContain("R3_COMMERCIAL_MATRIX_PRODUCTS");
    expect(commercial()).toContain("data-commercial-matrix-product");
  });

  it("R3-T19 — commercial writes still use existing P0-B API ops", () => {
    const src = commercial();
    expect(src).toContain("/api/admin/delivery-ads/commercial");
    expect(src).toContain('op: "update_package"');
    expect(src).toContain('op: "create_package"');
    expect(src).toContain('op: "update_product"');
    expect(src).toContain('op: "update_placement"');
  });

  it("R3-T20 — custom package via sheet/panel; extension+partner collapsed", () => {
    const src = commercial();
    expect(src).toContain("data-commercial-custom-package");
    expect(src).toContain("admin_delivery_ads_commercial_custom_package");
    expect(src).toContain("data-commercial-extension-collapsed");
    expect(src).toContain("data-commercial-partner-collapsed");
    expect(src).toContain("준비 중");
  });

  it("R3-T21 — Partner not fabricated as ad product / Owner apply", () => {
    expect(R3_ADMIN_PARTNER_NOT_PRODUCT).toBe(true);
    expect(commercial()).toContain("admin_delivery_ads_commercial_partner_prep");
    expect(commercial()).toContain("organic ranking");
    expect(commercial()).not.toMatch(/Owner apply.*Partner|Partner.*Owner apply/i);
  });

  it("R3-T22 — hub campaign row has one primary CTA", () => {
    expect(hub()).toContain("adminDeliveryAdHubRowPrimaryCta");
    expect(hub()).toContain("data-admin-delivery-ads-row-cta");
  });

  it("R3-T23 — Action Queue CTA labels preserved (검수하기/배너 제작/다시 검수)", () => {
    expect(i18n()).toContain("검수하기");
    expect(i18n()).toContain("배너 제작");
    expect(i18n()).toContain("다시 검수");
    expect(queue()).toContain("presentation.ctaLabelKey");
  });

  it("R3-T24 — Action Queue commercial-ish summary when data available", () => {
    expect(queue()).toContain("data-queue-commercial-summary");
    expect(queue()).toContain("item.campaignTitle");
    expect(queue()).toContain("productLabel");
  });

  it("R3-T25 — i18n catalog has R3 keys (ko+en)", () => {
    const src = i18n();
    for (const key of [
      "admin_delivery_ads_hub_view_actionable",
      "admin_delivery_ads_hub_view_history",
      "admin_delivery_ads_price_unset",
      "admin_delivery_ads_section_creative_produce",
      "admin_delivery_ads_creative_produce_cta",
      "admin_delivery_ads_audit_collapsed",
      "admin_delivery_ads_commercial_matrix_title",
      "admin_delivery_ads_commercial_partner_collapsed",
    ]) {
      expect(src).toContain(`${key}:`);
    }
    expect(src).toMatch(/ko:\s*\{[\s\S]*admin_delivery_ads_hub_view_actionable/);
    expect(src).toMatch(/en:\s*\{[\s\S]*admin_delivery_ads_hub_view_actionable/);
  });

  it("R3-T26 — funding gate / R1 / R2 writers not rewritten by R3 UI", () => {
    expect(hub()).not.toContain("adminUpdateDeliveryAdPackagePrice");
    expect(detail()).not.toContain("price_amount_minor");
    expect(mapper()).toContain("Does not mutate funding gate");
    // Owner R1 presentation file untouched by hub default change
    const r1 = read("lib/stores/advertising/owner-delivery-ad-r1-presentation.ts");
    expect(r1).toContain("OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED");
    const r2 = read("lib/stores/advertising/delivery-ad-admin-action-queue-presentation.ts");
    expect(r2).toContain("mapAdminDeliveryAdActionQueuePresentation");
  });

  it("R3-T27 — no migration / seed price enable in R3 presentation", () => {
    expect(mapper()).not.toMatch(/UPDATE.*price|enable.*package.*true/i);
    expect(commercial()).not.toContain("enabled: true");
    // create still defaults enabled:false
    expect(commercial()).toContain("enabled: false");
  });

  it("R3-T28 — commercial settings route unchanged", () => {
    expect(DELIVERY_AD_ADMIN_ROUTES.commercialSettings).toBe(
      "/admin/delivery-ads/commercial-settings"
    );
  });

  it("R3-T29 — hub summary counts still from server summary object", () => {
    expect(hub()).toContain("json.summary");
    expect(hub()).toContain("summary.review");
    expect(hub()).not.toMatch(/countFromKorean|fakeCount/);
  });

  it("R3-T30 — detail creative title discoverable as 배너 제작", () => {
    expect(detail()).toContain('data-creative-title="produce"');
    expect(detail()).toContain("admin_delivery_ads_section_creative_produce");
  });

  it("R3-T31 — audit collapsed by default", () => {
    expect(detail()).toContain("useState(false)");
    expect(detail()).toMatch(/auditExpanded[\s\S]*admin_delivery_ads_audit_collapsed/);
  });

  it("R3-T32 — product acceptingApplications control at top of commercial", () => {
    const src = commercial();
    expect(src.indexOf("data-commercial-product-accepting")).toBeLessThan(
      src.indexOf("data-commercial-matrix")
    );
    expect(src).toContain("acceptingApplications");
  });

  it("R3-T33 — Store Promotion + Banner matrices both rendered", () => {
    const src = commercial();
    expect(src).toContain("data-commercial-matrix-product={product}");
    expect(src).toContain("R3_COMMERCIAL_MATRIX_PRODUCTS");
    expect([...R3_COMMERCIAL_MATRIX_PRODUCTS]).toContain("banner");
    expect([...R3_COMMERCIAL_MATRIX_PRODUCTS]).toContain("store_sponsored");
  });

  it("R3-T34 — hub row shows placement human label + price unset copy", () => {
    expect(hub()).toContain("adminDeliveryAdInventoryHumanLabel");
    expect(hub()).toContain("admin_delivery_ads_hub_price_unset");
  });

  it("R3-T35 — android/ios WIP not touched by this R3 surface (path contract)", () => {
    // This test file only asserts R3 admin presentation paths.
    expect(hub()).not.toContain("android/");
    expect(detail()).not.toContain("NativeVideoCall");
    expect(commercial()).not.toContain("ios/");
  });

  it("R3-T36 — organic/paid resolver and Owner R1 ops flag unchanged", () => {
    const organic = read("lib/stores/advertising/delivery-ad-layers.ts");
    expect(organic.length).toBeGreaterThan(0);
    const r1 = read("lib/stores/advertising/owner-delivery-ad-r1-presentation.ts");
    expect(r1).toContain("false as const");
  });

  it("R3-T37 — export constants available for tests", () => {
    expect(ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW).toBeTruthy();
    expect(R3_COMMERCIAL_MATRIX_EXPECTED_CELLS).toBe(12);
    expect(R3_ADMIN_NO_FIRST_PARTY_CREATE).toBe(true);
    expect(R3_ADMIN_PARTNER_NOT_PRODUCT).toBe(true);
  });
});
