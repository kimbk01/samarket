import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_BELL_STORE_CHARGES_NOT_FOR_SUPPORT_BADGE,
  ADMIN_REAL_OPERATION_CUT_D_LOCKED,
  CUT_B_C_PRODUCTION_CARRY,
  CUT_D_SUPPORT_REFERENCE_CAPABILITY,
  SUPPORT_OPS_LEGACY_SEPARATION,
  assertAdminRealOperationCutDSupportPartnerHardLock,
} from "@/lib/admin/admin-real-operation-cut-d-support-partner-hard-lock";
import { SUPPORT_REFERENCE_TYPES } from "@/lib/support/support-reference-authority";
import {
  resolveSupportReferenceAdminHref,
  supportInboxHrefForReference,
  supportInboxHrefForStore,
} from "@/lib/support/support-reference-admin-href";
import { SUPPORT_CATEGORY_REGISTRY } from "@/lib/support/support-category-registry";
import { R3_ADMIN_PARTNER_NOT_PRODUCT } from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { OPS_THREAD_STATE } from "@/lib/admin/admin-real-operation-cut-a-authority-hard-lock";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("CUT D Support + Partner context linkage", () => {
  it("locks anchors + B/C production carry", () => {
    expect(ADMIN_REAL_OPERATION_CUT_D_LOCKED).toBe(true);
    expect(assertAdminRealOperationCutDSupportPartnerHardLock()).toBe(true);
    expect(SUPPORT_OPS_LEGACY_SEPARATION.mergeOpsThreadIntoSupport).toBe(false);
    expect(SUPPORT_OPS_LEGACY_SEPARATION.supportMutatesAds).toBe(false);
    expect(CUT_B_C_PRODUCTION_CARRY.financeProductionE2E).toBe("NOT_PROVEN");
    expect(CUT_B_C_PRODUCTION_CARRY.popupRuntime).toBe("NOT_PROVEN");
    expect(CUT_B_C_PRODUCTION_CARRY.tabletSupportPartner).toBe("NOT_PROVEN");
    expect(ADMIN_BELL_STORE_CHARGES_NOT_FOR_SUPPORT_BADGE).toBe(true);
  });

  it("S9/S16 — Support refs exist; ops/legacy stay separate", () => {
    expect([...SUPPORT_REFERENCE_TYPES]).toEqual(
      expect.arrayContaining([
        "AD_CAMPAIGN",
        "DELIVERY_AD_CAMPAIGN",
        "FEED_AD_REQUEST",
        "PLATFORM_POPUP_OWNER_REQUEST",
        "POINT_CHARGE_REQUEST",
        "BUSINESS_CASH_CHARGE_REQUEST",
        "PARTNER_MEMBERSHIP",
      ])
    );
    expect(CUT_D_SUPPORT_REFERENCE_CAPABILITY.FEED_AD).toBe(true);
    expect(CUT_D_SUPPORT_REFERENCE_CAPABILITY.POPUP).toBe(true);
    expect(CUT_D_SUPPORT_REFERENCE_CAPABILITY.domainSnapshotDuplication).toBe(false);
    expect(OPS_THREAD_STATE.mergeIntoSupportCases).toBe(false);
    expect(R3_ADMIN_PARTNER_NOT_PRODUCT).toBe(true);
  });

  it("S2/S3/S5/S6/S10 — Admin href resolvers point at canonical screens", () => {
    const adId = "11111111-1111-4111-8111-111111111111";
    expect(resolveSupportReferenceAdminHref("DELIVERY_AD_CAMPAIGN", adId)?.href).toContain(
      `/admin/delivery-ads/${adId}`
    );
    expect(resolveSupportReferenceAdminHref("FEED_AD_REQUEST", adId)?.href).toContain(
      "/admin/feed-ad-requests/"
    );
    expect(
      resolveSupportReferenceAdminHref("PLATFORM_POPUP_OWNER_REQUEST", adId)?.href
    ).toContain("/admin/platform-popup/requests/");
    expect(resolveSupportReferenceAdminHref("POINT_CHARGE_REQUEST", adId)?.href).toContain(
      "/admin/point-charges/"
    );
    expect(supportInboxHrefForReference(adId)).toContain(`search=${adId}`);
    expect(supportInboxHrefForStore(adId)).toContain("filter=OWNER");
  });

  it("category registry only allows known reference types", () => {
    const allowed = new Set(SUPPORT_REFERENCE_TYPES);
    for (const cat of SUPPORT_CATEGORY_REGISTRY) {
      for (const ref of cat.allowedReferenceTypes) {
        expect(allowed.has(ref as (typeof SUPPORT_REFERENCE_TYPES)[number])).toBe(true);
      }
    }
  });

  it("UI wires Support↔Ads and Partner context without mutation ownership", () => {
    const support = read("components/admin/support/AdminSupportPage.tsx");
    expect(support).toContain("resolveSupportCaseContextLinks");
    expect(support).not.toContain("admin_delivery_ad_transition");

    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toContain("data-admin-delivery-ads-support-link");
    expect(detail).toContain("data-admin-delivery-ads-support-ops-split");
    expect(detail).toContain("DeliveryAdOperationsPanel");

    const partner = read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx");
    expect(partner).toContain("data-partner-finance-link");
    expect(partner).toContain("data-partner-support-link");
    expect(partner).toContain("data-partner-store-link");
    expect(partner).toContain("data-partner-ads-link");
  });

  it("S17 — legacy platform inquiry writer remains blocked", () => {
    expect(read("app/api/admin/platform-inquiries/[id]/route.ts")).toContain("410");
    expect(read("app/admin/platform-inquiries/page.tsx")).toMatch(
      /redirect\(|permanentRedirect\(/
    );
  });
});
