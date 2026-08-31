/**
 * R2 — Owner↔Admin Operations UI wiring (static / source contract tests).
 * Does not apply migrations. Does not claim Production runtime.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isAdminBannerNeedsCreativeProduction,
  storeSponsoredRequiresBannerCreative,
} from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { mapAdminDeliveryAdActionQueuePresentation } from "@/lib/stores/advertising/delivery-ad-admin-action-queue-presentation";
import { OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED } from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";
import {
  OWNER_ADS_R2_OPERATIONS_PANEL_ENABLED,
  classifyOwnerAdsOpsBackendCapability,
  ownerAdsShouldMountOperationsPanel,
  ownerAdsShouldShowContactAdminCta,
} from "@/lib/stores/advertising/owner-delivery-ad-r2-operations";
import { OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";
import { ownerAdsDetailPanelsForLifecycle } from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const mig220 = () =>
  read("supabase/migrations/20261201220000_delivery_ads_cut3b_operations_timeline.sql");
const mig195 = () =>
  read("supabase/migrations/20261201195000_delivery_ads_p0a_commercial_package_partner.sql");
const messaging = () => read("lib/stores/advertising/delivery-ad-operations-messaging.ts");
const panel = () => read("components/stores/advertising/DeliveryAdOperationsPanel.tsx");
const ownerDetail = () =>
  read("components/business/owner/ads/OwnerDeliveryAdDetailView.tsx");
const r2Ops = () => read("lib/stores/advertising/owner-delivery-ad-r2-operations.ts");
const queuePres = () =>
  read("lib/stores/advertising/delivery-ad-admin-action-queue-presentation.ts");
const adminDetail = () =>
  read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
const queuePanel = () =>
  read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");

describe("R2 Owner↔Admin Operations UI wiring", () => {
  it("R2-T12 — message send does not mutate campaign lifecycle (source)", () => {
    const src = messaging();
    expect(src).toContain("Does NOT call campaign lifecycle");
    expect(src).toContain("sendDeliveryAdOperationsMessage");
    expect(src).not.toMatch(/owner_delivery_ad_transition|admin_delivery_ad_transition/);
    expect(src).not.toMatch(
      /from\([\s\S]{0,40}(store_sponsored_campaigns|banner_ad_campaigns)[\s\S]{0,80}\.update\(/
    );
    expect(panel()).not.toMatch(/adminActionAllowed|request_changes|lifecycleStatus/);
  });

  it("R2-T28 — Store Promotion never 제작 필요 from creative", () => {
    expect(storeSponsoredRequiresBannerCreative()).toBe(false);
    expect(
      isAdminBannerNeedsCreativeProduction({
        productKind: "store_sponsored",
        creativeAssetPath: null,
      })
    ).toBe(false);
    const p = mapAdminDeliveryAdActionQueuePresentation({
      productKind: "store_sponsored",
      lifecycleStatus: "SUBMITTED",
      creativeAssetPath: null,
    });
    expect(p.bucket).not.toBe("needs_creative");
    expect(p.cta).not.toBe("produce_banner");
  });

  it("R2-T29 — Banner incomplete creative → 제작 필요", () => {
    expect(
      isAdminBannerNeedsCreativeProduction({
        productKind: "banner",
        creativeAssetPath: OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
      })
    ).toBe(true);
    const p = mapAdminDeliveryAdActionQueuePresentation({
      productKind: "banner",
      lifecycleStatus: "SUBMITTED",
      creativeAssetPath: OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
    });
    expect(p.bucket).toBe("needs_creative");
    expect(p.cta).toBe("produce_banner");
    expect(p.ctaLabelKey).toBe("admin_delivery_ads_aq_cta_produce_banner");
  });

  it("R2-T31 — funding gate preserved in 220000 migration file", () => {
    const sql = mig220();
    expect(sql).toContain("funding_required");
    expect(sql).toContain("delivery_ad_campaign_funding_allows_active");
    expect(sql).toMatch(/RETURN jsonb_build_object\('ok', false, 'error', 'funding_required'\)/);
    expect(sql).toContain("audit_id");
    expect(sql).toMatch(/v_audit_id\s+uuid/);
    expect(sql).toMatch(/'audit_id',\s*v_audit_id/);
  });

  it("R2-T32 — R1 DRAFT funding absent regression", () => {
    expect(ownerAdsDetailPanelsForLifecycle("DRAFT").has("funding")).toBe(false);
    expect(ownerAdsShouldMountOperationsPanel("DRAFT")).toBe(false);
    expect(OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED).toBe(false);
  });

  it("R2-T33 — raw machine errors absent in Owner ops fail-closed copy", () => {
    expect(panel()).toContain("delivery_ad_ops_ui_unavailable");
    expect(panel()).toMatch(/광고 운영 연결을 사용할 수 없습니다/);
    expect(panel()).not.toMatch(/운영 기록을 불러오지 못했습니다/);
    expect(panel()).not.toMatch(/\{error\}|\{json\.error\}|schema cache|does not exist/);
    expect(classifyOwnerAdsOpsBackendCapability({ httpOk: false, status: 500 })).toBe(
      "unavailable"
    );
    expect(
      classifyOwnerAdsOpsBackendCapability({
        httpOk: false,
        jsonOk: false,
        error: "db_error",
        status: 500,
      })
    ).toBe("unavailable");
  });

  it("R2-T35 — package prices unchanged (195000 not edited / no price hardcode in R2 files)", () => {
    expect(
      existsSync(
        join(root, "supabase/migrations/20261201195000_delivery_ads_p0a_commercial_package_partner.sql")
      )
    ).toBe(true);
    expect(mig195().length).toBeGreaterThan(100);
    for (const src of [r2Ops(), queuePres(), panel(), ownerDetail()]) {
      expect(src).not.toMatch(/\b199\b|\b349\b|\b599\b/);
    }
  });

  it("Owner panel flag/enablement — R2 mounts; R1 stays false", () => {
    expect(OWNER_ADS_R2_OPERATIONS_PANEL_ENABLED).toBe(true);
    expect(OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED).toBe(false);
    expect(ownerAdsShouldMountOperationsPanel("SUBMITTED")).toBe(true);
    expect(ownerAdsShouldMountOperationsPanel("CHANGES_REQUESTED")).toBe(true);
    expect(ownerAdsShouldMountOperationsPanel("ACTIVE")).toBe(true);
    expect(ownerDetail()).toContain("<DeliveryAdOperationsPanel");
    expect(ownerDetail()).toContain("ownerAdsShouldMountOperationsPanel");
    expect(ownerDetail()).toContain("OWNER_ADS_R2_OPERATIONS_PANEL_ENABLED");
  });

  it("220000 contains funding_required AND audit_id", () => {
    const sql = mig220();
    expect(sql.includes("funding_required")).toBe(true);
    expect(sql.includes("audit_id")).toBe(true);
  });

  it("non-DRAFT contact CTA when ops available (not CHANGES_REQUESTED-only)", () => {
    expect(
      ownerAdsShouldShowContactAdminCta({
        lifecycleStatus: "CHANGES_REQUESTED",
        opsCapability: "available",
      })
    ).toBe(true);
    expect(
      ownerAdsShouldShowContactAdminCta({
        lifecycleStatus: "SUBMITTED",
        opsCapability: "available",
      })
    ).toBe(true);
    expect(
      ownerAdsShouldShowContactAdminCta({
        lifecycleStatus: "DRAFT",
        opsCapability: "available",
      })
    ).toBe(false);
    expect(
      ownerAdsShouldShowContactAdminCta({
        lifecycleStatus: "CHANGES_REQUESTED",
        opsCapability: "unavailable",
      })
    ).toBe(false);
    expect(ownerDetail()).toContain("owner_ads_contact_admin_cta");
  });

  it("Admin Action Queue uses presentation CTAs (not only 상세 보기)", () => {
    expect(queuePanel()).toContain("mapAdminDeliveryAdActionQueuePresentation");
    expect(queuePanel()).toContain("presentation.ctaLabelKey");
    expect(queuePanel()).toContain("data-admin-delivery-ads-queue-cta");
    expect(queuePres()).toContain("admin_delivery_ads_aq_cta_review");
    expect(queuePres()).toContain("admin_delivery_ads_aq_cta_produce_banner");
    expect(queuePres()).toContain("admin_delivery_ads_aq_cta_re_review");
    expect(adminDetail()).toContain("admin_delivery_ads_rd_current_status");
    expect(adminDetail()).toContain("data-admin-decision-primary-ctas");
    expect(adminDetail()).toContain("getAdminDeliveryAdRequiredDecisionPresentation");
  });

  it("queue buckets: SUBMITTED → 신규; resubmit soft signal → 수정 재제출; UNDER_REVIEW → 검수 대기", () => {
    expect(
      mapAdminDeliveryAdActionQueuePresentation({
        productKind: "store_sponsored",
        lifecycleStatus: "SUBMITTED",
      }).bucket
    ).toBe("new_application");
    expect(
      mapAdminDeliveryAdActionQueuePresentation({
        productKind: "store_sponsored",
        lifecycleStatus: "SUBMITTED",
        hadChangesRequested: true,
      }).bucket
    ).toBe("resubmit");
    expect(
      mapAdminDeliveryAdActionQueuePresentation({
        productKind: "banner",
        lifecycleStatus: "UNDER_REVIEW",
        creativeAssetPath: "https://cdn.example/ready.png",
      }).bucket
    ).toBe("awaiting_review");
  });
});
