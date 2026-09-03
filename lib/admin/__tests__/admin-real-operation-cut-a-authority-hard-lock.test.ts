import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  ADMIN_NAV_AUTHORITY,
  ADMIN_REAL_OPERATION_CUT_A_LOCKED,
  CASH_AUTHORITY,
  CATEGORY_POLICY_AUTHORITY,
  COIN_AUTHORITY,
  DELIVERY_AD_ADMIN_CTA_AUTHORITY,
  DELIVERY_AD_APPLICATION_ID_EQUALS_EXECUTION_ID,
  DELIVERY_AD_CREATIVE_AUTHORITY,
  DELIVERY_AD_ELIGIBILITY_AUTHORITY,
  DELIVERY_AD_EXECUTION_AUTHORITY,
  DELIVERY_AD_LIFECYCLE_AUTHORITY,
  DELIVERY_AD_PLACEMENT_AUTHORITY,
  DELIVERY_AD_PRODUCT_AUTHORITY,
  FEED_AD_AUTHORITY,
  FORBIDDEN_NEW_ADMIN_SHELL_ROUTES,
  HOME_COMPOSITION_AUTHORITY,
  LEGACY_DEAD_SURFACE_LOCKS,
  LEGACY_FINANCE_NO_NEW_WRITE,
  LEGACY_INQUIRY_STATE,
  NO_NEW_WRITE_API_FILES,
  OPS_THREAD_STATE,
  PARTNER_AUTHORITY,
  PLACEMENT_SYSTEMS,
  POINT_AUTHORITY,
  POPUP_AUTHORITY,
  REDIRECT_ONLY_ADMIN_PAGES,
  SCENARIO_A_R_ENTRY_LOCK,
  SUPPORT_AUTHORITY,
  SUPPORT_REFERENCE_CAPABILITY,
  assertAdminRealOperationCutAAuthorityHardLock,
} from "@/lib/admin/admin-real-operation-cut-a-authority-hard-lock";
import { DELIVERY_AD_PRODUCT_KEYS } from "@/lib/stores/advertising/delivery-ad-product-registry";
import { R3_ADMIN_PARTNER_NOT_PRODUCT } from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { SUPPORT_REFERENCE_TYPES } from "@/lib/support/support-reference-authority";
import { CURRENCY_AUTHORITY } from "@/lib/currency/currency-ssot-hard-lock";

const ROOT = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Admin Real Operation CUT A authority hard lock", () => {
  it("asserts lock anchors", () => {
    expect(ADMIN_REAL_OPERATION_CUT_A_LOCKED).toBe(true);
    expect(assertAdminRealOperationCutAAuthorityHardLock()).toBe(true);
  });

  it("locks admin nav to single menu tree", () => {
    expect(ADMIN_NAV_AUTHORITY.menuTree).toBe("components/admin/admin-menu.ts");
    expect(ADMIN_NAV_AUTHORITY.duplicateMenuTreeAllowed).toBe(false);
    expect(read("lib/admin-menu-config.ts")).toMatch(/Compatibility adapter|DO NOT invent a second menu tree/);
  });

  it("locks Point / Coin / Cash authorities without merging", () => {
    expect(POINT_AUTHORITY.ledgerTable).toBe("point_ledger");
    expect(POINT_AUTHORITY.deliveryAdSpend).toBe(false);
    expect(COIN_AUTHORITY.balanceTable).toBe(CURRENCY_AUTHORITY.COIN.balanceTable);
    expect(COIN_AUTHORITY.deliveryAdSpend).toBe(false);
    expect(CASH_AUTHORITY.productName).toBe("Cash");
    expect(CASH_AUTHORITY.balanceTable).toBe(CURRENCY_AUTHORITY.CASH.balanceTable);
    expect(CASH_AUTHORITY.deliveryAdSpend).toBe(true);
    expect(LEGACY_FINANCE_NO_NEW_WRITE).toContain("delivery_ad_accounts");
    expect(LEGACY_FINANCE_NO_NEW_WRITE).toContain("store_cash_accounts");
  });

  it("locks Delivery ad product/execution/creative/placement/lifecycle/cta/eligibility", () => {
    expect([...DELIVERY_AD_PRODUCT_AUTHORITY.keys]).toEqual([...DELIVERY_AD_PRODUCT_KEYS]);
    expect(DELIVERY_AD_EXECUTION_AUTHORITY.uiTerm).toBe("ad_execution");
    expect(DELIVERY_AD_APPLICATION_ID_EQUALS_EXECUTION_ID).toBe(true);
    expect(DELIVERY_AD_CREATIVE_AUTHORITY.table).toBe("delivery_ad_creatives");
    expect(DELIVERY_AD_PLACEMENT_AUTHORITY.module).toContain("delivery-ad-inventory");
    expect(DELIVERY_AD_LIFECYCLE_AUTHORITY.adminTransitionRpc).toBe("admin_delivery_ad_transition");
    expect(DELIVERY_AD_ADMIN_CTA_AUTHORITY.requiredDecision).toContain("required-decision");
    expect(DELIVERY_AD_ELIGIBILITY_AUTHORITY.sponsored).toContain("store-sponsored-exposure-eligibility");
    for (const rel of DELIVERY_AD_ADMIN_CTA_AUTHORITY.consumers) {
      expect(existsSync(path.join(ROOT, rel))).toBe(true);
      const body = read(rel);
      expect(
        body.includes("getAdminDeliveryAdRequiredDecisionPresentation") ||
          body.includes("mapAdminDeliveryAdActionQueuePresentation")
      ).toBe(true);
    }
  });

  it("keeps Feed / Popup / Delivery placement systems separate", () => {
    expect(FEED_AD_AUTHORITY.sharedWithDelivery).toBe(false);
    expect(POPUP_AUTHORITY.absorbIntoDeliveryTables).toBe(false);
    expect(PLACEMENT_SYSTEMS.delivery.unifyWithFeed).toBe(false);
    expect(PLACEMENT_SYSTEMS.feed.unifyWithDelivery).toBe(false);
    expect(PLACEMENT_SYSTEMS.targetPreviewReadModel).toBe("ADAPTER_OVER_SEPARATE_REGISTRIES");
  });

  it("locks HOME/CATEGORY as configuration CROSS_LINK_ONLY", () => {
    expect(HOME_COMPOSITION_AUTHORITY.adsMayWriteComposition).toBe(false);
    expect(HOME_COMPOSITION_AUTHORITY.targetRelation).toBe("CROSS_LINK_ONLY");
    expect(CATEGORY_POLICY_AUTHORITY.adsMayWriteComposition).toBe(false);
    expect(CATEGORY_POLICY_AUTHORITY.targetRelation).toBe("CROSS_LINK_ONLY");
  });

  it("locks Support vs ops thread vs legacy inquiry", () => {
    expect(SUPPORT_AUTHORITY.root).toBe("lib/support/*");
    expect(SUPPORT_REFERENCE_CAPABILITY.DELIVERY_AD).toBe(true);
    expect(SUPPORT_REFERENCE_CAPABILITY.FEED_AD).toBe(false);
    expect(SUPPORT_REFERENCE_CAPABILITY.POPUP).toBe(false);
    expect(SUPPORT_REFERENCE_TYPES).toContain("AD_CAMPAIGN");
    expect(SUPPORT_REFERENCE_TYPES).toContain("DELIVERY_AD_CAMPAIGN");
    expect(SUPPORT_REFERENCE_TYPES as readonly string[]).not.toContain("FEED_AD");
    expect(LEGACY_INQUIRY_STATE.writeApiStatus).toBe(410);
    expect(OPS_THREAD_STATE.mergeIntoSupportCases).toBe(false);
  });

  it("locks Partner as membership not AdProduct", () => {
    expect(PARTNER_AUTHORITY.type).toBe("MEMBERSHIP_NOT_AD_PRODUCT");
    expect(R3_ADMIN_PARTNER_NOT_PRODUCT).toBe(true);
    expect(DELIVERY_AD_PRODUCT_KEYS as readonly string[]).not.toContain("partner");
  });

  it("maps scenarios A–R without inventing new TARGET routes", () => {
    expect(SCENARIO_A_R_ENTRY_LOCK).toHaveLength(18);
    expect(SCENARIO_A_R_ENTRY_LOCK.map((s) => s.id).join("")).toBe("ABCDEFGHIJKLMNOPQR");
    const reset = SCENARIO_A_R_ENTRY_LOCK.find((s) => s.id === "R");
    expect(reset?.currentEntry).toBe("NONE");
    expect(reset?.currentResult).toBe("FAIL");
  });

  it("enforces redirect-only pages and NO_NEW_WRITE APIs", () => {
    for (const rel of REDIRECT_ONLY_ADMIN_PAGES) {
      const body = read(rel);
      expect(/redirect\(|permanentRedirect\(/.test(body)).toBe(true);
    }
    for (const rel of NO_NEW_WRITE_API_FILES) {
      expect(read(rel)).toContain("410");
    }
    expect(LEGACY_DEAD_SURFACE_LOCKS.length).toBeGreaterThanOrEqual(10);
    expect(FORBIDDEN_NEW_ADMIN_SHELL_ROUTES).toContain("/admin/ads-v2");
    for (const shell of ["app/admin/growth/page.tsx", "app/admin/ads-v2/page.tsx"]) {
      expect(existsSync(path.join(ROOT, shell))).toBe(false);
    }
  });

  it("records popup doc/code conflict without forcing runtime PASS", () => {
    expect(POPUP_AUTHORITY.docImplementationClaim).toBe("BLOCKED");
    expect(POPUP_AUTHORITY.codeState).toBe("IMPLEMENTED_MODULE_PRESENT");
    expect(POPUP_AUTHORITY.runtimeProductionPass).toBe("NOT_PROVEN");
    expect(existsSync(path.join(ROOT, "lib/platform-popup/campaign-lifecycle.ts"))).toBe(true);
  });
});
