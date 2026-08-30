/**
 * Priority 4 — Owner Delivery Ads detail next-action hierarchy (presentation only).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getOwnerDeliveryAdRequiredActionPresentation,
  ownerDeliveryAdNextActions,
} from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DELIVERY_AD_LIFECYCLE_STATUSES } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";

const detailSrc = () =>
  readFileSync(
    join(process.cwd(), "components/business/owner/ads/OwnerDeliveryAdDetailView.tsx"),
    "utf8"
  );

const previewSrc = () =>
  readFileSync(
    join(process.cwd(), "components/stores/advertising/DeliveryAdCampaignPlacementPreviews.tsx"),
    "utf8"
  );

const opsPanelSrc = () =>
  readFileSync(
    join(process.cwd(), "components/stores/advertising/DeliveryAdOperationsPanel.tsx"),
    "utf8"
  );

function baseInput(status: DeliveryAdLifecycleStatus, productKind: "store_sponsored" | "banner") {
  return {
    lifecycleStatus: status,
    productKind,
    storeId: "store-1",
    campaignId: "camp-1",
  } as const;
}

describe("Priority 4 Owner detail next-action", () => {
  it("T1 — detail sections place required-action before preview/commercial/performance", () => {
    const src = detailSrc();
    const order = [
      'data-owner-ads-detail-section="required-action"',
      'data-owner-ads-detail-section="commercial"',
      'data-owner-ads-detail-section="preview"',
      'data-owner-ads-detail-section="performance"',
    ];
    let prev = -1;
    for (const marker of order) {
      const idx = src.indexOf(marker);
      expect(idx).toBeGreaterThan(prev);
      prev = idx;
    }
    expect(src).not.toContain('data-owner-ads-detail-section="operations"');
  });

  it("T2/T3/T4 — CHANGES_REQUESTED requires correction + admin reason + existing edit path", () => {
    for (const productKind of ["store_sponsored", "banner"] as const) {
      const ra = getOwnerDeliveryAdRequiredActionPresentation(baseInput("CHANGES_REQUESTED", productKind));
      expect(ra.ownerTaskRequired).toBe(true);
      expect(ra.showAdminReason).toBe(true);
      expect(ra.titleKey).toBe("owner_ads_ra_changes_requested_title");
      expect(ra.primaryHref?.kind).toBe("href");
      expect(ra.primaryHref?.href).toContain(
        productKind === "banner"
          ? DELIVERY_AD_OWNER_ROUTES.createBanner
          : DELIVERY_AD_OWNER_ROUTES.createStoreSponsored
      );
      expect(ra.primaryHref?.href).toContain("campaignId=camp-1");
      const actions = ownerDeliveryAdNextActions(baseInput("CHANGES_REQUESTED", productKind));
      expect(actions.some((a) => a.kind === "action" && a.action === "resubmit")).toBe(true);
    }
  });

  it("T5 — SUBMITTED/UNDER_REVIEW produce no fake owner-required task", () => {
    for (const status of ["SUBMITTED", "UNDER_REVIEW"] as const) {
      for (const productKind of ["store_sponsored", "banner"] as const) {
        const ra = getOwnerDeliveryAdRequiredActionPresentation(baseInput(status, productKind));
        expect(ra.ownerTaskRequired).toBe(false);
        expect(ra.primaryHref).toBeNull();
        expect(ra.titleKey).toBe("owner_ads_ra_waiting_title");
      }
    }
  });

  it("T6/T7 — REJECTED does not map to resubmit; guides new application", () => {
    for (const productKind of ["store_sponsored", "banner"] as const) {
      const actions = ownerDeliveryAdNextActions(baseInput("REJECTED", productKind));
      expect(actions.some((a) => a.kind === "action" && a.action === "resubmit")).toBe(false);
      const ra = getOwnerDeliveryAdRequiredActionPresentation(baseInput("REJECTED", productKind));
      expect(ra.ownerTaskRequired).toBe(false);
      expect(ra.guidanceHref?.href).toBe(DELIVERY_AD_OWNER_ROUTES.hub);
      expect(ra.primaryHref).toBeNull();
      expect(ra.showAdminReason).toBe(true);
    }
  });

  it("T8/T9 — PAUSED_ADMIN differs from PAUSED_OWNER; no unauthorized resume", () => {
    const admin = getOwnerDeliveryAdRequiredActionPresentation(
      baseInput("PAUSED_ADMIN", "store_sponsored")
    );
    const owner = getOwnerDeliveryAdRequiredActionPresentation(
      baseInput("PAUSED_OWNER", "store_sponsored")
    );
    expect(admin.titleKey).toBe("owner_ads_ra_paused_admin_title");
    expect(owner.titleKey).toBe("owner_ads_ra_paused_owner_title");
    expect(admin.titleKey).not.toBe(owner.titleKey);

    const adminActions = ownerDeliveryAdNextActions(baseInput("PAUSED_ADMIN", "banner"));
    expect(adminActions.some((a) => a.kind === "action" && a.action === "resume")).toBe(false);

    const ownerActions = ownerDeliveryAdNextActions(baseInput("PAUSED_OWNER", "banner"));
    expect(ownerActions.some((a) => a.kind === "action" && a.action === "resume")).toBe(true);
  });

  it("T10 — ACTIVE has no fabricated required task", () => {
    const ra = getOwnerDeliveryAdRequiredActionPresentation(baseInput("ACTIVE", "store_sponsored"));
    expect(ra.ownerTaskRequired).toBe(false);
    expect(ra.primaryHref).toBeNull();
    expect(ra.titleKey).toBe("owner_ads_ra_active_title");
  });

  it("T11 — DRAFT uses existing continue/edit flow", () => {
    const ra = getOwnerDeliveryAdRequiredActionPresentation(baseInput("DRAFT", "banner"));
    expect(ra.ownerTaskRequired).toBe(true);
    expect(ra.primaryHref?.href).toContain(DELIVERY_AD_OWNER_ROUTES.createBanner);
    expect(ra.primaryHref?.labelKey).toBe("owner_ads_edit_again");
  });

  it("T12 — Store Sponsored and Banner share lifecycle next-action semantics", () => {
    for (const status of DELIVERY_AD_LIFECYCLE_STATUSES) {
      const a = getOwnerDeliveryAdRequiredActionPresentation(
        baseInput(status, "store_sponsored")
      );
      const b = getOwnerDeliveryAdRequiredActionPresentation(baseInput(status, "banner"));
      expect(a.titleKey).toBe(b.titleKey);
      expect(a.bodyKey).toBe(b.bodyKey);
      expect(a.ownerTaskRequired).toBe(b.ownerTaskRequired);
      expect(a.showAdminReason).toBe(b.showAdminReason);
      expect(Boolean(a.primaryHref)).toBe(Boolean(b.primaryHref));
      expect(Boolean(a.guidanceHref)).toBe(Boolean(b.guidanceHref));
    }
  });

  it("T13/T14 — canonical customer preview reused; owner_preview telemetry-free", () => {
    const src = detailSrc();
    expect(src).toContain("DeliveryAdCampaignPlacementPreviews");
    expect(src).toContain('renderContext="owner_preview"');
    expect(src).not.toContain("DeliveryAdSponsoredBeacon");
    expect(previewSrc()).toContain("DeliveryAdCampaignPlacementPreviews");
    expect(previewSrc()).not.toContain("DeliveryAdSponsoredBeacon");
  });

  it("T15/T16 — R1 CUT3 fail-closed: operations panel not mounted on Owner detail", () => {
    const src = detailSrc();
    expect(src).not.toContain("<DeliveryAdOperationsPanel");
    expect(src).toContain("OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED");
    expect(opsPanelSrc()).toContain("DeliveryAdOperationsComposer");
    expect(opsPanelSrc()).not.toMatch(/lifecycleStatus|ownerDeliveryAdNextActions|transitionOwner/);
  });
});
