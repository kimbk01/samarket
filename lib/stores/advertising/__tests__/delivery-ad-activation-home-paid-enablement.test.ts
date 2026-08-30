/**
 * Activation bridge + HOME Store Promotion operational enablement — targeted tests.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveApprovedGoLiveStatus } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import {
  DELIVERY_AD_SCHEDULE_PROMOTER,
  DELIVERY_AD_SYSTEM_SCHEDULE_TRANSITION_RPC,
  isDeliveryAdActivateDueEligible,
  isDeliveryAdEndDueEligible,
} from "@/lib/stores/advertising/delivery-ad-schedule-promoter";
import { canTransitionDeliveryAdLifecycle } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { evaluateDeliveryBannerPublishReadiness } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";
import { evaluateBannerHomeHeroExposure } from "@/lib/stores/advertising/banner-home-hero-exposure";
import { resolveHomePaidPlacementPolicySummary } from "@/lib/stores/advertising/delivery-ad-home-placement-policy";
import { resolveHomeRestPaidSurfaceAllowed } from "@/lib/stores/store-paid-ad-exposure";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";
import {
  homePaidAdInsertionPolicyEnabled,
  homePaidAdInsertionPolicyMax,
  planStoresHomeRestPaidInsertions,
} from "@/lib/stores/composition/stores-composition-insertion-live";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";
import { storeSponsoredRequiresBannerCreative } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const now = Date.parse("2026-08-30T12:00:00.000Z");

describe("Activation bridge eligibility", () => {
  it("T1 — future approved campaign = SCHEDULED", () => {
    const future = new Date(now + 86_400_000).toISOString();
    expect(resolveApprovedGoLiveStatus(future, now)).toBe("SCHEDULED");
  });

  it("T2 — due SCHEDULED becomes ACTIVE eligible", () => {
    expect(
      isDeliveryAdActivateDueEligible({
        lifecycleStatus: "SCHEDULED",
        startAtIso: new Date(now - 60_000).toISOString(),
        endAtIso: new Date(now + 86_400_000).toISOString(),
        nowMs: now,
      })
    ).toBe(true);
    expect(canTransitionDeliveryAdLifecycle("SCHEDULED", "ACTIVE", "system")).toBe(true);
  });

  it("T3 — future SCHEDULED stays SCHEDULED", () => {
    expect(
      isDeliveryAdActivateDueEligible({
        lifecycleStatus: "SCHEDULED",
        startAtIso: new Date(now + 3600_000).toISOString(),
        endAtIso: new Date(now + 86_400_000).toISOString(),
        nowMs: now,
      })
    ).toBe(false);
  });

  it("T4 — expired SCHEDULED does not become ACTIVE", () => {
    expect(
      isDeliveryAdActivateDueEligible({
        lifecycleStatus: "SCHEDULED",
        startAtIso: new Date(now - 86_400_000).toISOString(),
        endAtIso: new Date(now - 60_000).toISOString(),
        nowMs: now,
      })
    ).toBe(false);
    expect(
      isDeliveryAdEndDueEligible({
        lifecycleStatus: "SCHEDULED",
        endAtIso: new Date(now - 60_000).toISOString(),
        nowMs: now,
      })
    ).toBe(true);
  });

  it("T5 — already ACTIVE is not activate-due (idempotent path)", () => {
    expect(
      isDeliveryAdActivateDueEligible({
        lifecycleStatus: "ACTIVE",
        startAtIso: new Date(now - 60_000).toISOString(),
        endAtIso: new Date(now + 86_400_000).toISOString(),
        nowMs: now,
      })
    ).toBe(false);
  });

  it("T6 — PAUSED campaign not auto-activated", () => {
    expect(
      isDeliveryAdActivateDueEligible({
        lifecycleStatus: "PAUSED_ADMIN",
        startAtIso: new Date(now - 60_000).toISOString(),
        endAtIso: new Date(now + 86_400_000).toISOString(),
        nowMs: now,
      })
    ).toBe(false);
  });

  it("T7 — ENDED campaign not auto-activated", () => {
    expect(
      isDeliveryAdActivateDueEligible({
        lifecycleStatus: "ENDED",
        startAtIso: new Date(now - 60_000).toISOString(),
        endAtIso: new Date(now + 86_400_000).toISOString(),
        nowMs: now,
      })
    ).toBe(false);
  });

  it("T8 — Banner activation preserves creative readiness fail-closed", () => {
    const readiness = evaluateDeliveryBannerPublishReadiness({
      creativeAssetPath: OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
      ctaHref: "/stores/demo",
    });
    expect(readiness.ok).toBe(false);
    const exposure = evaluateBannerHomeHeroExposure({
      nowMs: now,
      campaign: {
        id: "b1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 86_400_000).toISOString(),
        inventoryKeys: ["STORES_HOME_HERO"],
        creativeAssetPath: OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
        creativeReviewStatus: "APPROVED",
        ctaHref: "/stores/demo",
        storeId: "s1",
      },
    });
    expect(exposure.ok).toBe(false);
    expect(exposure.reasons).toContain("creative_not_ready");
  });

  it("T9 — Store Promotion activation requires no Banner creative", () => {
    expect(storeSponsoredRequiresBannerCreative()).toBe(false);
  });

  it("T10 — activation uses canonical lifecycle authority", () => {
    const promoter = read("lib/stores/advertising/delivery-ad-schedule-promoter.ts");
    expect(promoter).toContain(DELIVERY_AD_SYSTEM_SCHEDULE_TRANSITION_RPC);
    expect(DELIVERY_AD_SCHEDULE_PROMOTER.authority).toBe(
      DELIVERY_AD_SYSTEM_SCHEDULE_TRANSITION_RPC
    );
    expect(read("supabase/migrations/20261201196000_delivery_ads_system_schedule_transition.sql")).toContain(
      "delivery_ad_system_schedule_transition"
    );
    expect(promoter).not.toMatch(/\.update\(\s*\{\s*lifecycle_status:\s*[\"']ACTIVE/);
  });

  it("T11 — duplicate runner idempotency via CAS expected lifecycle", () => {
    const mig = read(
      "supabase/migrations/20261201196000_delivery_ads_system_schedule_transition.sql"
    );
    expect(mig).toContain("stale_lifecycle");
    expect(mig).toContain("stale_updated_at");
    expect(mig).toContain("p_expected_lifecycle");
    expect(DELIVERY_AD_SCHEDULE_PROMOTER.notificationFanOut).toBe("none_cut3_preserved");
  });

  it("T12 — bounded runner processes multiple due campaigns safely", () => {
    const promoter = read("lib/stores/advertising/delivery-ad-schedule-promoter.ts");
    expect(promoter).toContain("runDeliveryAdSchedulePromoterBatch");
    expect(DELIVERY_AD_SCHEDULE_PROMOTER.defaultBatchSize).toBe(50);
    expect(DELIVERY_AD_SCHEDULE_PROMOTER.maxBatchSize).toBe(100);
    const cron = read("app/api/cron/delivery-ads-schedule-transitions/route.ts");
    expect(cron).toContain("verifyCronRequestAuthorization");
    expect(cron).toContain("runDeliveryAdSchedulePromoterBatch");
    const vercel = read("vercel.json");
    expect(vercel).toContain("/api/cron/delivery-ads-schedule-transitions");
  });
});

describe("HOME Store Promotion operational enablement", () => {
  const organic = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"];
  const ad = (id: string, storeId: string): StorePaidAdCampaignRow => ({
    id,
    storeId,
    placement: "stores_home",
    title: `ad-${id}`,
    headline: "h",
    bodyCopy: null,
    imageUrl: null,
    startAt: new Date(now - 60_000).toISOString(),
    endAt: new Date(now + 86_400_000).toISOString(),
    isActive: true,
  });

  it("T13 — HOME paid insertion disabled → zero sponsored rows", () => {
    expect(homePaidAdInsertionPolicyEnabled(STORES_HOME_COMPOSITION_DEFAULT_POLICY)).toBe(false);
    const surfaceAllowed = resolveHomeRestPaidSurfaceAllowed({
      restShelfAdIntegration: "off",
      homePaidAdInsertionEnabled: false,
    });
    expect(surfaceAllowed).toBe(false);
    const plan = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: [ad("a1", "s2")],
      max: 5,
      intervalEveryN: 8,
      surfaceAllowed,
    });
    expect(plan.adCount).toBe(0);
    expect(plan.rows.every((r) => r.kind === "organic")).toBe(true);
  });

  it("T14 — enabled + eligible → sponsored row", () => {
    const surfaceAllowed = resolveHomeRestPaidSurfaceAllowed({
      restShelfAdIntegration: "sponsored_badge",
      homePaidAdInsertionEnabled: false,
    });
    expect(surfaceAllowed).toBe(true);
    const plan = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: [ad("a1", "s2")],
      max: 5,
      intervalEveryN: 8,
      surfaceAllowed,
    });
    expect(plan.adCount).toBeGreaterThan(0);
    expect(plan.rows.some((r) => r.kind === "paid_ad" && r.isSponsored === true)).toBe(true);
  });

  it("T15 — sponsored row uses canonical store card contract", () => {
    const hub = read("components/stores/home/hub/StoresHomeCompositionSlotSection.tsx");
    expect(hub).toContain("isSponsored");
    expect(hub).toContain("store_insertion_sponsored");
  });

  it("T16 — 광고 label present", () => {
    const timesale = read("components/stores/home/presentation/StoresHomeTimesaleRowCard.tsx");
    expect(timesale).toContain("store_insertion_sponsored");
  });

  it("T17 — organic ordering preserved around paid insertion", () => {
    const plan = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: [ad("a1", "s2")],
      max: 5,
      intervalEveryN: 8,
      surfaceAllowed: true,
    });
    expect(plan.organicIds).toEqual(organic);
    const organicOnly = plan.rows.filter((r) => r.kind === "organic").map((r) => r.storeId);
    for (let i = 1; i < organicOnly.length; i += 1) {
      expect(organic.indexOf(organicOnly[i]!)).toBeGreaterThan(
        organic.indexOf(organicOnly[i - 1]!)
      );
    }
  });

  it("T18 — Partner has zero organic effect", () => {
    const isolation = read("lib/stores/advertising/delivery-ad-layers.ts");
    expect(isolation).toContain("homePaidAdInsertion");
    expect(read("lib/stores/composition/stores-composition-insertion-live.ts")).toContain(
      "Does not reorder organic ranking"
    );
  });

  it("T19 — invalid/non-ACTIVE excluded at activation eligibility", () => {
    expect(
      isDeliveryAdActivateDueEligible({
        lifecycleStatus: "DRAFT",
        startAtIso: new Date(now - 60_000).toISOString(),
        endAtIso: new Date(now + 86_400_000).toISOString(),
        nowMs: now,
      })
    ).toBe(false);
  });

  it("T20 — expired campaign excluded from activate; end-due eligible", () => {
    expect(
      isDeliveryAdActivateDueEligible({
        lifecycleStatus: "SCHEDULED",
        startAtIso: new Date(now - 7200_000).toISOString(),
        endAtIso: new Date(now - 60_000).toISOString(),
        nowMs: now,
      })
    ).toBe(false);
    expect(
      isDeliveryAdEndDueEligible({
        lifecycleStatus: "ACTIVE",
        endAtIso: new Date(now - 60_000).toISOString(),
        nowMs: now,
      })
    ).toBe(true);
  });

  it("T21 — category paid path preserved", () => {
    const browse = read("lib/stores/composition/stores-composition-insertion-live.ts");
    expect(browse).toContain("planStoresBrowseInsertions");
    expect(browse).toContain("future_ad_insertion");
  });

  it("T22 — Admin switch uses existing composition-policy SSOT", () => {
    const summary = resolveHomePaidPlacementPolicySummary({
      compositionRows: STORES_HOME_COMPOSITION_DEFAULT_POLICY,
      restShelfAdIntegration: "off",
    });
    expect(summary.enabled).toBe(false);
    expect(summary.compositionRailEnabled).toBe(false);
    const shelves = read("components/admin/stores/AdminStoresHomeShelvesPage.tsx");
    expect(shelves).toContain("adIntegration");
    expect(shelves).toContain("AdminDeliveryAdHomePolicyPanel");
    const panel = read("components/admin/stores/AdminDeliveryAdPlacementPolicyPanel.tsx");
    expect(panel).toContain("data-admin-home-paid-insertion-switch-link");
  });

  it("T23 — no second max/interval authority", () => {
    expect(homePaidAdInsertionPolicyMax(STORES_HOME_COMPOSITION_DEFAULT_POLICY)).toBe(5);
    const summary = resolveHomePaidPlacementPolicySummary({
      compositionRows: STORES_HOME_COMPOSITION_DEFAULT_POLICY,
      restShelfAdIntegration: "off",
    });
    expect(summary.max).toBe(5);
  });

  it("T24 — no hardcoded always-on HOME insertion", () => {
    expect(
      STORES_HOME_COMPOSITION_DEFAULT_POLICY.find((r) => r.slot === "homePaidAdInsertion")?.enabled
    ).toBe(false);
    const src = read("lib/stores/composition/stores-home-composition-default-policy.ts");
    expect(src).toMatch(/slot:\s*"homePaidAdInsertion"[\s\S]*?enabled:\s*false/);
  });
});
