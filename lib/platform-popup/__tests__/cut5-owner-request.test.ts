/**
 * @vitest-environment node
 * CUT 5 — Owner Paid Platform Popup request bridge contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertOwnerCannotApproveOrActivatePlatformPopup,
  assertPaymentDoesNotActivatePlatformPopup,
  canAdminTransitionPlatformPopupRequest,
  canOwnerTransitionPlatformPopupRequest,
  isOwnerEditablePlatformPopupRequest,
  isOwnerSubmitEligiblePlatformPopupRequest,
  nextPaymentAfterReject,
  nextStatusForAdminAction,
} from "@/lib/platform-popup/owner-request-lifecycle";
import {
  canSetPlatformPopupApproval,
  assertPlatformPopupActivationAllowed,
} from "@/lib/platform-popup/campaign-lifecycle";
import { PLATFORM_POPUP_OWNER_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";

const ROOT = process.cwd();
function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("CUT5 ownership + lifecycle", () => {
  it("owner may submit draft and cancel, but never approve request as admin edge", () => {
    expect(canOwnerTransitionPlatformPopupRequest("draft", "submitted")).toBe(true);
    expect(canOwnerTransitionPlatformPopupRequest("draft", "cancelled")).toBe(true);
    expect(canOwnerTransitionPlatformPopupRequest("revision_required", "submitted")).toBe(true);
    expect(canOwnerTransitionPlatformPopupRequest("submitted", "approved")).toBe(false);
    expect(canOwnerTransitionPlatformPopupRequest("under_review", "approved")).toBe(false);
  });

  it("admin may approve/reject/revision/start_review from submitted", () => {
    expect(canAdminTransitionPlatformPopupRequest("submitted", "under_review")).toBe(true);
    expect(canAdminTransitionPlatformPopupRequest("submitted", "approved")).toBe(true);
    expect(canAdminTransitionPlatformPopupRequest("under_review", "rejected")).toBe(true);
    expect(canAdminTransitionPlatformPopupRequest("under_review", "revision_required")).toBe(true);
    expect(nextStatusForAdminAction("approve")).toBe("approved");
    expect(nextStatusForAdminAction("revision_required")).toBe("revision_required");
  });

  it("editable/submit only draft + revision_required", () => {
    expect(isOwnerEditablePlatformPopupRequest("draft")).toBe(true);
    expect(isOwnerEditablePlatformPopupRequest("revision_required")).toBe(true);
    expect(isOwnerEditablePlatformPopupRequest("submitted")).toBe(false);
    expect(isOwnerSubmitEligiblePlatformPopupRequest("approved")).toBe(false);
  });

  it("reject refunds funded payment status; revision does not change payment helper", () => {
    expect(nextPaymentAfterReject("funded")).toBe("refunded");
    expect(nextPaymentAfterReject("unfunded")).toBe("unfunded");
  });
});

describe("CUT5 payment != active + Owner cannot approve", () => {
  it("payment cannot activate campaign", () => {
    expect(assertPaymentDoesNotActivatePlatformPopup().ok).toBe(true);
    expect(
      assertPlatformPopupActivationAllowed({
        actor: "payment",
        nextStatus: "active",
        nextApproval: "approved",
      }).ok
    ).toBe(false);
  });

  it("Owner cannot approve or activate campaigns", () => {
    expect(assertOwnerCannotApproveOrActivatePlatformPopup().ok).toBe(true);
    expect(canSetPlatformPopupApproval("pending_review", "approved", "owner")).toBe(false);
    expect(
      assertPlatformPopupActivationAllowed({
        actor: "owner",
        nextStatus: "scheduled",
        nextApproval: "approved",
      }).ok
    ).toBe(false);
  });

  it("submit writer sets funded but never campaign active (file contract)", () => {
    const writer = readRepo("lib/platform-popup/owner-request-writer.ts");
    expect(writer).toContain('productKind: "platform_popup"');
    expect(writer).toContain('payment_status: "funded"');
    expect(writer).toContain("campaign_activated: false");
    expect(writer).not.toContain('approval_status: "approved"');
    expect(writer).not.toContain('status: "active"');
    expect(writer).toContain("assertOwnerStoreEligibleForAds");
  });

  it("approve module is idempotent one-request-one-campaign (file contract)", () => {
    const approve = readRepo("lib/platform-popup/owner-request-approve.ts");
    expect(approve).toContain("admin_campaign_id");
    expect(approve).toContain("owner_request_id");
    expect(approve).toContain("idempotent: true");
    expect(approve).toContain("validatePlatformPopupCampaignForApproval");
    expect(approve).toContain('productKind: "platform_popup"');
    expect(approve).toContain("refundBusinessCashForRejectedDeliveryAd");
    expect(approve).toContain("revision_required");
    expect(approve).toContain("refunded: false");
  });
});

describe("CUT5 routes + UI contracts", () => {
  it("owner routes point to popup paths not delivery_ad campaign tables", () => {
    expect(PLATFORM_POPUP_OWNER_ROUTES.createPlatformPopup).toBe(
      "/stores/owner/ads/new/platform-popup"
    );
    expect(PLATFORM_POPUP_OWNER_ROUTES.popupRequestDetail("abc")).toBe(
      "/stores/owner/ads/popup/abc"
    );
    const routes = readRepo("lib/platform-popup/platform-popup-owner-routes.ts");
    expect(routes).not.toContain("store_paid_ad_campaigns");
    expect(routes).not.toContain("store_banner_ad_campaigns");
  });

  it("owner APIs exist", () => {
    expect(readRepo("app/api/me/platform-popup-requests/route.ts")).toContain("createPlatformPopupOwnerDraft");
    expect(readRepo("app/api/me/platform-popup-requests/[requestId]/submit/route.ts")).toContain(
      "idempotencyKey"
    );
    expect(readRepo("app/api/me/platform-popup-requests/[requestId]/creative/route.ts")).toContain(
      "platform-popup-creatives"
    );
    expect(readRepo("app/api/me/platform-popup-packages/route.ts")).toContain(
      "listActivePlatformPopupAdPackages"
    );
  });

  it("admin APIs exist with approve|reject|revision_required|start_review", () => {
    const actions = readRepo(
      "app/api/admin/platform-popup-requests/[requestId]/actions/route.ts"
    );
    expect(actions).toContain("adminActOnPlatformPopupOwnerRequest");
    expect(actions).toContain("activate");
    expect(actions).toContain("schedule");
  });

  it("Owner UI uses DibayPopupAd embedded preview", () => {
    const apply = readRepo("components/business/owner/ads/OwnerPlatformPopupApplyView.tsx");
    expect(apply).toContain('from "@/components/platform-popup/DibayPopupAd"');
    expect(apply).toContain("embedded");
    expect(apply).not.toContain("GlobalPopupHost");
    const detail = readRepo(
      "components/business/owner/ads/OwnerPlatformPopupRequestDetailView.tsx"
    );
    expect(detail).toContain("DibayPopupAd");
    expect(detail).toContain("embedded");
  });

  it("hub product select links createPlatformPopup", () => {
    const hub = readRepo("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    expect(hub).toContain("PLATFORM_POPUP_OWNER_ROUTES.createPlatformPopup");
    expect(hub).toContain('productKind="platform_popup"');
  });

  it("BC writer productKind includes platform_popup", () => {
    const bc = readRepo("lib/stores/advertising/canonical-business-cash-writer.ts");
    expect(bc).toMatch(/productKind:[\s\S]*"platform_popup"/);
  });

  it("migration cut5 exists (historical file contract)", () => {
    const mig = readRepo(
      "supabase/migrations/20261203140000_platform_popup_owner_request_cut5.sql"
    );
    expect(mig).toContain("platform_popup_owner_requests");
    expect(mig).toContain("platform_popup_ad_packages");
    expect(mig).toContain("'platform_popup'");
  });

  it("barrel exports CUT5 modules", () => {
    const index = readRepo("lib/platform-popup/index.ts");
    expect(index).toContain("owner-request-types");
    expect(index).toContain("owner-request-lifecycle");
    expect(index).toContain("owner-request-writer");
    expect(index).toContain("owner-request-loader");
    expect(index).toContain("owner-request-approve");
    expect(index).toContain("platform-popup-owner-routes");
  });
});
