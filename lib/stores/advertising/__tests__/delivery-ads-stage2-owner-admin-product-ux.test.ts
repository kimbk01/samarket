/**
 * Stage 2 — Owner/Admin product UX source locks (AST-005 funding UI, CTAs).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ownerAdsDetailPanelsForLifecycle } from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Stage 2 Owner/Admin Delivery Ads product UX", () => {
  it("funding GET routes use AST-005 canonical BC (not Store Cash)", () => {
    const owner = read("app/api/me/delivery-ads/[campaignId]/funding/route.ts");
    const admin = read("app/api/admin/delivery-ads/business-cash/route.ts");
    expect(owner).toContain("AST_005_BUSINESS_CASH");
    expect(owner).toContain("loadCanonicalBcFundingDetailForApplication");
    expect(owner).not.toContain("loadCampaignStoreCashSpendRow");
    expect(admin).toContain("AST_005_BUSINESS_CASH");
    expect(admin).toContain("loadCanonicalBcFundingDetailForApplication");
    expect(admin).not.toContain("loadCampaignStoreCashSpendRow");
  });

  it("insufficient BC modal navigates to Business Cash with returnTo / convert", () => {
    const modal = read(
      "components/stores/advertising/DeliveryAdOwnerInsufficientCashSubmitModal.tsx"
    );
    expect(modal).toContain("returnTo");
    expect(modal).toContain("/stores/owner/business-cash");
    expect(modal).toContain("#convert");
    expect(modal).not.toContain("onSubmitAnyway()");
  });

  it("Ads Hub / charge sheet do not link gift-certificates for ad pay", () => {
    const hub = read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    const sheet = read("components/business/owner/ads/OwnerDeliveryAdCashChargeSheet.tsx");
    expect(hub).not.toMatch(/gift-certificates/);
    expect(sheet).not.toMatch(/gift-certificates/);
    expect(sheet).toContain("/stores/owner/business-cash");
    expect(hub).toContain("/stores/owner/business-cash");
    expect(hub).toContain("#ledger");
  });

  it("detail panels include history for SUBMITTED+ / CHANGES_REQUESTED", () => {
    expect(ownerAdsDetailPanelsForLifecycle("SUBMITTED").has("history")).toBe(true);
    expect(ownerAdsDetailPanelsForLifecycle("UNDER_REVIEW").has("history")).toBe(true);
    expect(ownerAdsDetailPanelsForLifecycle("CHANGES_REQUESTED").has("history")).toBe(true);
    expect(ownerAdsDetailPanelsForLifecycle("ACTIVE").has("history")).toBe(true);
    expect(ownerAdsDetailPanelsForLifecycle("DRAFT").has("history")).toBe(false);
  });

  it("Admin Partner memberships expose REJECTED + reject op for PENDING", () => {
    const view = read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx");
    expect(view).toContain("REJECTED");
    expect(view).toContain('op: "approve" | "reject" | "end"');
    expect(view).toContain('data-partner-reject="1"');
  });

  it("Admin detail funding copy uses Business Cash AST-005 (no Store Cash ad pay)", () => {
    const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(detail).toContain("data-admin-ast005-authority");
    expect(detail).not.toContain("data-admin-store-cash-authority");
    expect(detail).toMatch(/Business Cash \(AST-005\)/);
  });

  it("BC page honors returnTo + convert/ledger anchors", () => {
    const page = read("app/(main)/stores/owner/business-cash/page.tsx");
    const view = read("components/business/owner/OwnerBusinessCashView.tsx");
    expect(page).toContain("returnTo");
    expect(page).toContain("data-owner-bc-return-to");
    expect(view).toContain('id="convert"');
    expect(view).toContain('id="ledger"');
  });
});
