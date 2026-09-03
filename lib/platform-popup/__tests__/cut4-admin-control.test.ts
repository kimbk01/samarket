/**
 * @vitest-environment node
 * CUT 4 — Admin Platform Popup Control Center contracts (targeted).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validatePlatformPopupCampaignForApproval,
  platformPopupMaterialEditRequiresReview,
} from "@/lib/platform-popup/admin-campaign-authority";
import {
  assertPlatformPopupActivationAllowed,
  canSetPlatformPopupApproval,
  canTransitionPlatformPopupStatus,
} from "@/lib/platform-popup/campaign-lifecycle";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { PLATFORM_POPUP_TARGET_SURFACES } from "@/lib/platform-popup/types";

const ROOT = process.cwd();
function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const validSnap = {
  name: "QA",
  status: "pending_review" as const,
  approvalStatus: "pending_review" as const,
  priority: 1,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2026-12-31T00:00:00.000Z",
  timezone: "Asia/Manila",
  suppressionMode: "TODAY" as const,
  suppressionDurationSeconds: null,
  ctaType: "internal_page" as const,
  ctaTarget: "/market",
  externalUrl: null,
  surfaces: ["GLOBAL"] as const,
  creative: {
    id: "cr",
    status: "ready",
    aspectW: 36,
    aspectH: 25,
    assetPath: "campaigns/x/a.webp",
    assetUrl: "https://example.com/a.webp",
  },
};

describe("CUT4 Admin routes + preview authority", () => {
  it("admin pages exist under /admin/platform-popup", () => {
    expect(readRepo("app/admin/platform-popup/page.tsx")).toContain("AdminPlatformPopupHubPage");
    expect(readRepo("app/admin/platform-popup/[campaignId]/page.tsx")).toContain(
      "AdminPlatformPopupDetailWorkspace"
    );
  });

  it("menu leaf is Global Popup Ads under growth ads, not delivery-ads", () => {
    const menu = readRepo("components/admin/admin-menu.ts");
    expect(menu).toContain('path: "/admin/platform-popup"');
    expect(menu).toContain("ads-platform-popup");
    expect(menu).not.toMatch(/platform-popup[\s\S]{0,40}delivery-ads/);
  });

  it("preview imports exact DibayPopupAd and does not emit analytics", () => {
    const preview = readRepo("components/admin/platform-popup/AdminPlatformPopupPreview.tsx");
    expect(preview).toContain('from "@/components/platform-popup/DibayPopupAd"');
    expect(preview).toContain("embedded");
    expect(preview).toContain("onRenderComplete={() => {");
    expect(preview).not.toContain("recordPlatformPopupEvent");
    expect(preview).not.toContain("AdminBannerPreview");
  });

  it("no separate admin popup renderer component", () => {
    expect(() =>
      readRepo("components/admin/platform-popup/AdminPopupMock.tsx")
    ).toThrow();
  });
});

describe("CUT4 validation before approval", () => {
  it("passes complete campaign", () => {
    expect(validatePlatformPopupCampaignForApproval(validSnap).ok).toBe(true);
  });

  it("blocks missing creative", () => {
    const r = validatePlatformPopupCampaignForApproval({ ...validSnap, creative: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("creative_required");
  });

  it("blocks missing surface", () => {
    const r = validatePlatformPopupCampaignForApproval({ ...validSnap, surfaces: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("surface_required");
  });

  it("blocks invalid schedule", () => {
    const r = validatePlatformPopupCampaignForApproval({
      ...validSnap,
      startAt: "2026-12-01T00:00:00.000Z",
      endAt: "2026-01-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("schedule_invalid");
  });

  it("blocks invalid CTA", () => {
    const r = validatePlatformPopupCampaignForApproval({
      ...validSnap,
      ctaType: "internal_page",
      ctaTarget: "/admin/secret",
    });
    expect(r.ok).toBe(false);
  });

  it("blocks DURATION without seconds", () => {
    const r = validatePlatformPopupCampaignForApproval({
      ...validSnap,
      suppressionMode: "DURATION",
      suppressionDurationSeconds: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("suppression_duration_required");
  });

  it("wrong aspect blocked", () => {
    const r = validatePlatformPopupCampaignForApproval({
      ...validSnap,
      creative: { ...validSnap.creative!, aspectW: 16, aspectH: 9 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("creative_aspect_invalid");
  });
});

describe("CUT4 lifecycle + payment/owner hard rules", () => {
  it("payment cannot activate", () => {
    const r = assertPlatformPopupActivationAllowed({
      actor: "payment",
      nextStatus: "active",
      nextApproval: "approved",
    });
    expect(r.ok).toBe(false);
  });

  it("owner cannot approve", () => {
    expect(canSetPlatformPopupApproval("pending_review", "approved", "owner")).toBe(false);
  });

  it("draft cannot go active directly", () => {
    expect(canTransitionPlatformPopupStatus("draft", "active", "admin")).toBe(false);
  });

  it("pending_review can approve then active", () => {
    expect(canTransitionPlatformPopupStatus("pending_review", "approved", "admin")).toBe(true);
    expect(canTransitionPlatformPopupStatus("approved", "active", "admin")).toBe(true);
  });

  it("material edit on active requires review", () => {
    expect(platformPopupMaterialEditRequiresReview("active")).toBe(true);
    expect(platformPopupMaterialEditRequiresReview("scheduled")).toBe(true);
    expect(platformPopupMaterialEditRequiresReview("draft")).toBe(false);
  });
});

describe("CUT4 surfaces + CTA + TODAY semantic", () => {
  it("exposes only advertising target surfaces", () => {
    expect([...PLATFORM_POPUP_TARGET_SURFACES]).toEqual([
      "GLOBAL",
      "COMMUNITY",
      "TRADE",
      "DELIVERY",
      "DELIVERY_OWNER",
      "ADMIN",
      "MYPAGE",
    ]);
  });

  it("CTA fail-closed for admin paths", () => {
    expect(
      validatePlatformPopupCta({ ctaType: "internal_page", ctaTarget: "/admin" }).ok
    ).toBe(false);
  });

  it("detail UI documents TODAY != 24h", () => {
    const detail = readRepo(
      "components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx"
    );
    expect(detail).toMatch(/not 24 hours/i);
    expect(detail).toMatch(/calendar day/i);
  });
});

describe("CUT4 API authority files", () => {
  it("CRUD + creative + transition routes exist", () => {
    expect(readRepo("app/api/admin/platform-popup-campaigns/route.ts")).toContain("POST");
    expect(readRepo("app/api/admin/platform-popup-campaigns/[campaignId]/route.ts")).toContain(
      "PATCH"
    );
    expect(
      readRepo("app/api/admin/platform-popup-campaigns/[campaignId]/creative/route.ts")
    ).toContain("platform-popup-creatives");
    expect(
      readRepo("app/api/admin/platform-popup-campaigns/[campaignId]/transition/route.ts")
    ).toContain("requireAdminApiUser");
  });

  it("approval path loads validation gate", () => {
    const t = readRepo("lib/platform-popup/admin-transitions.ts");
    expect(t).toContain("validatePlatformPopupCampaignForApproval");
  });
});
