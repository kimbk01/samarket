/**
 * Priority 5 — Admin Action Queue + decision-first detail (presentation only).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminActionRequiresReason,
  ADMIN_DELIVERY_AD_ACTIONS,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import {
  getAdminDeliveryAdRequiredDecisionPresentation,
  adminDeliveryAdOpsCaseStatusLabelKey,
} from "@/lib/stores/advertising/delivery-ad-admin-required-decision";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DELIVERY_AD_LIFECYCLE_STATUSES } from "@/lib/stores/advertising/delivery-ad-lifecycle";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const hubSrc = () => read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
const queuePanelSrc = () => read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");
const detailSrc = () => read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
const queueAuthSrc = () =>
  read("lib/stores/advertising/delivery-ad-operations-action-queue.ts");
const opsPanelSrc = () =>
  read("components/stores/advertising/DeliveryAdOperationsPanel.tsx");
const previewSrc = () =>
  read("components/stores/advertising/DeliveryAdCampaignPlacementPreviews.tsx");

describe("Priority 5 Admin Action Queue + decision-first detail", () => {
  it("T1 — hub places Action Queue before campaign list", () => {
    const src = hubSrc();
    expect(src.indexOf('data-admin-delivery-ads-section="action-queue"')).toBeLessThan(
      src.indexOf('data-admin-delivery-ads-section="campaign-list"')
    );
    expect(src.indexOf("<AdminDeliveryAdActionQueuePanel")).toBeLessThan(
      src.indexOf('data-admin-delivery-ads-section="campaign-list"')
    );
  });

  it("T2/T3/T4/T5/T6 — Action Queue still uses CUT 3 WAITING_ADMIN-only authority", () => {
    const aq = queueAuthSrc();
    expect(aq).toContain("listDeliveryAdAdminActionQueue");
    expect(aq).toContain("countDeliveryAdAdminActionQueue");
    expect(aq).toContain('eq("status", "WAITING_ADMIN")');
    expect(aq).not.toContain('WAITING_OWNER"');
    expect(aq).not.toMatch(/\.eq\("status", "RESOLVED"\)/);
    expect(aq).toContain("DELIVERY_AD_OPERATIONS_CASE_TABLE");
    expect(aq).toContain(".order(\"updated_at\", { ascending: false })");
    // one case → one queue item (push once per caseId)
    expect(aq).toContain("caseId");
    expect(aq).toContain("items.push");
    expect(queuePanelSrc()).toContain("/api/admin/delivery-ads/action-queue");
  });

  it("T7/T8 — queue rows expose available context with human labels", () => {
    const src = queuePanelSrc();
    expect(src).toContain("item.productKind");
    expect(src).toContain("item.campaignTitle");
    expect(src).toContain("item.campaignLifecycle");
    expect(src).toContain("item.caseStatus");
    expect(src).toContain("item.updatedAt");
    expect(src).toContain("mapAdminDeliveryAdActionQueuePresentation");
    expect(src).toContain("admin_delivery_ads_product_banner");
    expect(src).toContain("admin_delivery_ads_product_store_sponsored");
    expect(src).not.toMatch(/>\s*\{item\.caseStatus\}\s*</);
    expect(adminDeliveryAdOpsCaseStatusLabelKey("WAITING_ADMIN")).toBe(
      "admin_delivery_ads_case_waiting_admin"
    );
  });

  it("T9 — queue click uses existing Admin campaign detail", () => {
    const src = queuePanelSrc();
    expect(src).toContain("item.destination");
    expect(src).toMatch(/focus=\$\{focus\}|focus=operations|focus=creative/);
    expect(queueAuthSrc()).toContain("DELIVERY_AD_ADMIN_ROUTES.detail");
    expect(DELIVERY_AD_ADMIN_ROUTES.detail("camp-x")).toContain("camp-x");
  });

  it("T10 — Admin detail puts required decision before performance/history (R3 order)", () => {
    const src = detailSrc();
    const order = [
      'data-admin-delivery-ads-detail-section="required-decision"',
      'data-admin-delivery-ads-detail-section="application"',
      'data-admin-delivery-ads-detail-section="funding"',
      'data-admin-delivery-ads-detail-section="preview"',
      'data-admin-delivery-ads-detail-section="decision-actions"',
      'data-admin-delivery-ads-detail-section="operations"',
      'data-admin-delivery-ads-detail-section="settings"',
      'data-admin-delivery-ads-detail-section="history"',
    ];
    let prev = -1;
    for (const marker of order) {
      const idx = src.indexOf(marker);
      expect(idx).toBeGreaterThan(prev);
      prev = idx;
    }
    // Performance is lifecycle-gated; marker may be conditional but when present after settings
    const perfIdx = src.indexOf('data-admin-delivery-ads-detail-section="performance"');
    const settingsIdx = src.indexOf('data-admin-delivery-ads-detail-section="settings"');
    expect(perfIdx).toBeGreaterThan(settingsIdx);
  });

  it("T11 — states without required Admin action do not fabricate one", () => {
    for (const status of ["ACTIVE", "CHANGES_REQUESTED", "REJECTED", "DRAFT"] as const) {
      const d = getAdminDeliveryAdRequiredDecisionPresentation(status);
      expect(d.decisionRequired).toBe(false);
    }
    expect(getAdminDeliveryAdRequiredDecisionPresentation("SUBMITTED").decisionRequired).toBe(
      true
    );
    expect(
      getAdminDeliveryAdRequiredDecisionPresentation("UNDER_REVIEW").decisionRequired
    ).toBe(true);
  });

  it("T12/T13/T14 — review actions reuse lifecycle authority; request_changes ≠ reject; reason preserved", () => {
    const src = detailSrc();
    expect(src).toContain("adminActionAllowed");
    expect(src).toContain("adminActionRequiresReason");
    expect(src).toContain("request_changes");
    expect(src).toContain("reject");
    expect(adminActionRequiresReason("request_changes")).toBe(true);
    expect(adminActionRequiresReason("reject")).toBe(true);
    expect(ADMIN_DELIVERY_AD_ACTIONS).toContain("request_changes");
    expect(ADMIN_DELIVERY_AD_ACTIONS).toContain("reject");
    const under = getAdminDeliveryAdRequiredDecisionPresentation("UNDER_REVIEW");
    expect(under.primaryReviewActions).toContain("request_changes");
    expect(under.primaryReviewActions).toContain("reject");
    expect(under.primaryReviewActions).toContain("approve");
  });

  it("T15/T16 — Owner communication uses DeliveryAdOperationsPanel; messaging ≠ lifecycle write", () => {
    const src = detailSrc();
    expect(src).toContain("DeliveryAdOperationsPanel");
    expect(src).toContain('actorRole="admin"');
    expect(opsPanelSrc()).toContain("DeliveryAdOperationsComposer");
    expect(opsPanelSrc()).not.toMatch(/adminActionAllowed|request_changes|lifecycleStatus/);
  });

  it("T17/T18 — canonical customer preview reused; telemetry-free", () => {
    const src = detailSrc();
    expect(src).toContain("DeliveryAdCampaignPlacementPreviews");
    expect(src).toContain('renderContext="admin_preview"');
    expect(src).not.toContain("DeliveryAdSponsoredBeacon");
    expect(previewSrc()).not.toContain("DeliveryAdSponsoredBeacon");
  });

  it("T19 — Action Queue remains distinct from unread", () => {
    const aq = queueAuthSrc();
    expect(aq).not.toMatch(/unread|last_read/);
    expect(queuePanelSrc()).toMatch(/읽지 않은 메시지와는 별개|Separate from unread/);
    expect(hubSrc()).not.toMatch(/markRead|unreadCount/);
  });

  it("T20 — Admin Direct Create remains NOT_IMPLEMENTED on Delivery Ads hub/detail", () => {
    expect(hubSrc()).not.toMatch(/직접 등록|AdminDirectCreate|createCampaignWriter/);
    expect(detailSrc()).not.toMatch(/직접 등록|AdminDirectCreate|createCampaignWriter/);
    expect(hubSrc()).not.toContain("AdminStoreBannerAdWriterPanel");
    expect(hubSrc()).not.toContain("AdminStorePaidAdWriterPanel");
  });

  it("exhaustive lifecycle mapping does not invent required decisions outside review", () => {
    for (const status of DELIVERY_AD_LIFECYCLE_STATUSES) {
      const d = getAdminDeliveryAdRequiredDecisionPresentation(status);
      if (status === "SUBMITTED" || status === "UNDER_REVIEW") {
        expect(d.decisionRequired).toBe(true);
      } else {
        expect(d.decisionRequired).toBe(false);
      }
    }
  });
});
