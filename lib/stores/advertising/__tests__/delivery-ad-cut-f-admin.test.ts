/**
 * CUT F — Admin Delivery Ads control-plane domain contracts (F1–F33 subset).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminActionAllowed,
  adminActionRequiresReason,
  adminActionTargetLifecycle,
  lifecycleToAdminListBucket,
  normalizeAdminDisplayLifecycle,
  resolveApprovedGoLiveStatus,
  validateAdminDeliveryAdSchedule,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { canPhysicallyDeleteDeliveryAdCampaign } from "@/lib/stores/advertising/delivery-ad-audit";
import { canTransitionDeliveryAdLifecycle } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { ownerActionTargetLifecycle } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import {
  evaluateStoreSponsoredExposureEligibility,
  type StoreSponsoredRuntimeCampaign,
} from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import { evaluateBannerHomeHeroExposure } from "@/lib/stores/advertising/banner-home-hero-exposure";
import { validateOwnerBannerCta, validateOwnerBannerCreativeAspect } from "@/lib/stores/advertising/owner-banner-contract";
import { validateOwnerInventorySelection } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { CUT_F_ADMIN_TRANSACTIONAL_MUTATION } from "@/lib/stores/advertising/admin-delivery-ad-writer";
import { DELIVERY_AD_ADMIN_ROUTES, DELIVERY_AD_LEGACY_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DELIVERY_AD_BANNER_RENDERER_CONTRACT } from "@/lib/stores/advertising/delivery-ad-banner-contract";

const ZERO_HISTORY = {
  hasImpression: false,
  hasClick: false,
  hasAttribution: false,
  hasBilling: false,
  hasFinancialHistory: false,
  hasAuditHistory: false,
};

function sponsored(partial: Partial<StoreSponsoredRuntimeCampaign>): StoreSponsoredRuntimeCampaign {
  const now = Date.now();
  return {
    id: "c1",
    storeId: "s1",
    lifecycleStatus: "ACTIVE",
    reviewStatus: "APPROVED",
    startAt: new Date(now - 3600_000).toISOString(),
    endAt: new Date(now + 86400_000).toISOString(),
    inventoryKeys: ["STORES_HOME_FEED"],
    placement: "stores_home",
    title: "t",
    headline: "h",
    bodyCopy: null,
    imageUrl: null,
    isActive: true,
    ...partial,
  };
}

describe("CUT F Admin Delivery Ads", () => {
  it("F4 start_review SUBMITTED → UNDER_REVIEW", () => {
    expect(adminActionAllowed("start_review", "SUBMITTED")).toBe(true);
    expect(adminActionTargetLifecycle("start_review", "SUBMITTED")).toBe("UNDER_REVIEW");
  });

  it("F5 CHANGES_REQUESTED requires reason", () => {
    expect(adminActionRequiresReason("request_changes")).toBe(true);
    expect(adminActionAllowed("request_changes", "UNDER_REVIEW")).toBe(true);
  });

  it("F6 UNDER_REVIEW → APPROVED path allowed", () => {
    expect(adminActionAllowed("approve", "UNDER_REVIEW")).toBe(true);
  });

  it("F7 REJECT requires reason", () => {
    expect(adminActionRequiresReason("reject")).toBe(true);
  });

  it("F8 approve future → SCHEDULED", () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    expect(resolveApprovedGoLiveStatus(future)).toBe("SCHEDULED");
  });

  it("F8b approve current → ACTIVE", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(resolveApprovedGoLiveStatus(past)).toBe("ACTIVE");
  });

  it("F9 ACTIVE → PAUSED_ADMIN", () => {
    expect(adminActionAllowed("pause", "ACTIVE")).toBe(true);
    expect(adminActionRequiresReason("pause")).toBe(true);
  });

  it("F10 PAUSED_ADMIN → ACTIVE resume", () => {
    expect(adminActionAllowed("resume", "PAUSED_ADMIN")).toBe(true);
  });

  it("F11 Admin END", () => {
    expect(adminActionAllowed("end", "ACTIVE")).toBe(true);
    expect(adminActionAllowed("end", "PAUSED_ADMIN")).toBe(true);
  });

  it("F12 TERMINATE requires reason", () => {
    expect(adminActionRequiresReason("terminate")).toBe(true);
    expect(adminActionAllowed("terminate", "ACTIVE")).toBe(true);
  });

  it("F13 Archive from terminal states", () => {
    expect(adminActionAllowed("archive", "ENDED")).toBe(true);
    expect(adminActionAllowed("archive", "REJECTED")).toBe(true);
    expect(adminActionAllowed("archive", "TERMINATED")).toBe(true);
  });

  it("F14 unsafe physical delete rejected", () => {
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "ACTIVE",
        history: ZERO_HISTORY,
      })
    ).toBe(false);
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "DRAFT",
        history: { ...ZERO_HISTORY, hasAuditHistory: true },
      })
    ).toBe(false);
  });

  it("F15 safe DRAFT delete allowed", () => {
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "DRAFT",
        history: ZERO_HISTORY,
      })
    ).toBe(true);
  });

  it("F16 inventory edit validates compatibility", () => {
    expect(validateOwnerInventorySelection(["STORES_HOME_FEED"]).ok).toBe(true);
    expect(validateOwnerInventorySelection(["STORES_SEARCH_TOP"]).ok).toBe(false);
  });

  it("F17 Admin banner creative replacement creates new version (writer contract)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/advertising/admin-delivery-ad-writer.ts"),
      "utf8"
    );
    expect(src).toContain("adminReplaceBannerCreative");
    expect(src).toContain("supersedes_creative_id");
    expect(src).toContain("creative_replaced");
  });

  it("F18 invalid banner ratio rejected", () => {
    const bad = validateOwnerBannerCreativeAspect({
      inventoryKey: "STORES_HOME_HERO",
      sourceWidth: 16,
      sourceHeight: 9,
    });
    expect(bad.ok).toBe(false);
  });

  it("F19 external CTA rejected", () => {
    const v = validateOwnerBannerCta({
      ctaType: "store_detail",
      ctaTargetId: "s1",
      externalUrl: "https://evil.example",
    });
    expect(v.ok).toBe(false);
  });

  it("F22/F23 CAS contract present in RPC migration", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261201150000_delivery_ads_cut_f_admin_transition_rpc.sql"),
      "utf8"
    );
    expect(sql).toContain("stale_lifecycle");
    expect(sql).toContain("stale_updated_at");
    expect(sql).toContain("p_expected_lifecycle");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.admin_delivery_ad_transition");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_transition");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("is_platform_admin");
  });

  it("F20 audit actions written in RPC", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261201150000_delivery_ads_cut_f_admin_transition_rpc.sql"),
      "utf8"
    );
    expect(sql).toContain("delivery_ad_audit_logs");
    expect(sql).toContain("review_started");
    expect(sql).toContain("paused_admin");
    expect(sql).toContain("terminated_admin");
  });

  it("F25 PAUSED_ADMIN cannot Owner resume", () => {
    expect(ownerActionTargetLifecycle("resume")).toBe("ACTIVE");
    expect(canTransitionDeliveryAdLifecycle("PAUSED_ADMIN", "ACTIVE", "owner")).toBe(false);
  });

  it("F26 ACTIVE sponsored eligible when gates pass", () => {
    const r = evaluateStoreSponsoredExposureEligibility({
      campaign: sponsored({ lifecycleStatus: "ACTIVE" }),
      surface: "STORES_HOME_FEED",
      nowMs: Date.now(),
      storeEligibleById: new Map([["s1", true]]),
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(r.ok).toBe(true);
  });

  it("F27 PAUSED_ADMIN removes eligibility", () => {
    const r = evaluateStoreSponsoredExposureEligibility({
      campaign: sponsored({ lifecycleStatus: "PAUSED_ADMIN" }),
      surface: "STORES_HOME_FEED",
      nowMs: Date.now(),
      storeEligibleById: new Map([["s1", true]]),
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(r.ok).toBe(false);
  });

  it("F28 resume restores ACTIVE eligibility path", () => {
    expect(adminActionAllowed("resume", "PAUSED_ADMIN")).toBe(true);
    const r = evaluateStoreSponsoredExposureEligibility({
      campaign: sponsored({ lifecycleStatus: "ACTIVE" }),
      surface: "STORES_HOME_FEED",
      nowMs: Date.now(),
      storeEligibleById: new Map([["s1", true]]),
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(r.ok).toBe(true);
  });

  it("F29 TERMINATED never eligible", () => {
    const r = evaluateStoreSponsoredExposureEligibility({
      campaign: sponsored({ lifecycleStatus: "TERMINATED" }),
      surface: "STORES_HOME_FEED",
      nowMs: Date.now(),
      storeEligibleById: new Map([["s1", true]]),
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(r.ok).toBe(false);
  });

  it("F30/F31 Banner ACTIVE vs PAUSED_ADMIN", () => {
    const now = Date.now();
    const base = {
      id: "b1",
      lifecycleStatus: "ACTIVE" as const,
      reviewStatus: "APPROVED" as const,
      startAt: new Date(now - 1000).toISOString(),
      endAt: new Date(now + 86400_000).toISOString(),
      inventoryKeys: ["STORES_HOME_HERO"],
      creativeAssetPath: "/x.png",
      creativeReviewStatus: "APPROVED" as const,
      ctaHref: "/stores/s1",
      storeId: "s1",
    };
    expect(evaluateBannerHomeHeroExposure({ campaign: base, nowMs: now }).ok).toBe(true);
    expect(
      evaluateBannerHomeHeroExposure({
        campaign: { ...base, lifecycleStatus: "PAUSED_ADMIN" },
        nowMs: now,
      }).ok
    ).toBe(false);
  });

  it("F32 legacy Admin writers disabled (410)", () => {
    const paid = readFileSync(
      join(process.cwd(), "app/api/admin/store-paid-ads/route.ts"),
      "utf8"
    );
    const banner = readFileSync(
      join(process.cwd(), "app/api/admin/store-banner-ads/route.ts"),
      "utf8"
    );
    expect(paid).toContain("legacy_writer_disabled");
    expect(paid).toContain("status: 410");
    expect(banner).toContain("legacy_writer_disabled");
    expect(banner).toContain("status: 410");
  });

  it("F33 organic ranking remains paid-independent (domain export)", () => {
    const domain = readFileSync(
      join(process.cwd(), "lib/stores/advertising/delivery-ad-domain.ts"),
      "utf8"
    );
    expect(domain).toContain("DELIVERY_AD_ORGANIC_PAID_ISOLATION");
  });

  it("canonical admin routes + transactional mutation authority", () => {
    expect(DELIVERY_AD_ADMIN_ROUTES.hub).toBe("/admin/delivery-ads");
    expect(DELIVERY_AD_LEGACY_ADMIN_ROUTES.disposition).toBe("canonical_redirect");
    expect(CUT_F_ADMIN_TRANSACTIONAL_MUTATION.authority).toBe("admin_delivery_ad_transition");
    expect(CUT_F_ADMIN_TRANSACTIONAL_MUTATION.sequentialCompensationForbidden).toBe(true);
    expect(DELIVERY_AD_BANNER_RENDERER_CONTRACT.singleComponent).toBe("DeliveryAdBanner");
  });

  it("list buckets + display schedule hint", () => {
    expect(lifecycleToAdminListBucket("SUBMITTED")).toBe("review");
    expect(lifecycleToAdminListBucket("ACTIVE")).toBe("active");
    expect(lifecycleToAdminListBucket("PAUSED_ADMIN")).toBe("held");
    const hint = normalizeAdminDisplayLifecycle({
      lifecycleStatus: "ACTIVE",
      startAt: new Date(Date.now() - 86400_000 * 10).toISOString(),
      endAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(hint.scheduleHint).toBe("ended");
  });

  it("admin schedule validator", () => {
    const now = Date.now();
    expect(
      validateAdminDeliveryAdSchedule({
        startAtIso: new Date(now - 3600_000).toISOString(),
        endAtIso: new Date(now + 86400_000).toISOString(),
        nowMs: now,
      }).ok
    ).toBe(true);
    expect(
      validateAdminDeliveryAdSchedule({
        startAtIso: new Date(now).toISOString(),
        endAtIso: new Date(now - 1000).toISOString(),
        nowMs: now,
      }).ok
    ).toBe(false);
  });
});
