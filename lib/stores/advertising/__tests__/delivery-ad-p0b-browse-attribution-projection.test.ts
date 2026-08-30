/**
 * P0-B — BROWSE STORES_CATEGORY_FEED attribution projection (BACKEND_DEFECT_REQUIRED).
 * Proves attachStoresBrowseInsertionMeta issues canonical exposureToken and consumer mounts beacon.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectBrowsePaidAdInsertionMetaRow,
} from "@/lib/stores/composition/stores-composition-browse-insertion-meta";
import { verifyDeliveryAdExposureToken } from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { planStoresBrowseInsertions } from "@/lib/stores/composition/stores-composition-insertion-live";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";

const browseMetaSrc = () =>
  readFileSync(
    join(process.cwd(), "lib/stores/composition/stores-composition-browse-insertion-meta.ts"),
    "utf8"
  );

const browseViewSrc = () =>
  readFileSync(
    join(process.cwd(), "components/stores/browse/StoresBrowsePrimaryView.tsx"),
    "utf8"
  );

const browseCardSrc = () =>
  readFileSync(
    join(process.cwd(), "components/stores/browse/StoreBrowseCategoryRowCard.tsx"),
    "utf8"
  );

const beaconSrc = () =>
  readFileSync(
    join(process.cwd(), "components/stores/advertising/DeliveryAdSponsoredBeacon.tsx"),
    "utf8"
  );

function browsePolicyAdOn(everyN: number, max: number): StoresCompositionSectionContract[] {
  return [
    {
      surface: "browse",
      slot: "organic_discovery_list",
      contentType: "store",
      enabled: true,
      order: 0,
      interval: { consumed: false, reason: "NOT_CONSUMED" },
      max: null,
      titleAuthority: "none",
    },
    {
      surface: "browse",
      slot: "future_ad_insertion",
      contentType: "ad",
      enabled: true,
      order: 1,
      interval: { consumed: true, everyN },
      max,
      titleAuthority: "none",
    },
  ];
}

function paidPayload(
  overrides: Partial<StorePaidAdCampaignRow> & Pick<StorePaidAdCampaignRow, "id" | "storeId">
): StorePaidAdCampaignRow {
  return {
    id: overrides.id,
    storeId: overrides.storeId,
    title: overrides.title ?? "t",
    headline: overrides.headline ?? "h",
    bodyCopy: overrides.bodyCopy ?? null,
    imageUrl: overrides.imageUrl ?? null,
    placement: overrides.placement ?? "stores_browse",
    startAt: overrides.startAt ?? "2020-01-01T00:00:00.000Z",
    endAt: overrides.endAt ?? "2099-01-01T00:00:00.000Z",
    isActive: overrides.isActive ?? true,
    lifecycleStatus: overrides.lifecycleStatus ?? "ACTIVE",
    reviewStatus: overrides.reviewStatus ?? "APPROVED",
    inventoryKeys: overrides.inventoryKeys ?? ["STORES_CATEGORY_FEED"],
  };
}

describe("P0-B BROWSE attribution projection", () => {
  it("T1/T2 — projectBrowsePaidAdInsertionMetaRow issues canonical exposureToken", () => {
    const row = projectBrowsePaidAdInsertionMetaRow(
      paidPayload({ id: "camp-browse-1", storeId: "store-1" })
    );
    expect(row.kind).toBe("paid_ad");
    expect(row.campaignId).toBe("camp-browse-1");
    expect(row.storeId).toBe("store-1");
    expect(row.isSponsored).toBe(true);
    expect(typeof row.exposureToken).toBe("string");
    expect(row.exposureToken.length).toBeGreaterThan(10);

    const verified = verifyDeliveryAdExposureToken(row.exposureToken);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.campaignId).toBe("camp-browse-1");
      expect(verified.payload.storeId).toBe("store-1");
      expect(verified.payload.surface).toBe("STORES_CATEGORY_FEED");
      expect(verified.payload.productKind).toBe("store_sponsored");
      expect(verified.payload.destinationType).toBe("store_detail");
      expect(verified.payload.destinationId).toBe("store-1");
      expect(verified.payload.preview).toBe(false);
    }
  });

  it("T1/T2 — attachStoresBrowseInsertionMeta projects via existing issuer helper", () => {
    const src = browseMetaSrc();
    expect(src).toContain("issueEligibleDeliveryAdExposure");
    expect(src).toContain("projectBrowsePaidAdInsertionMetaRow");
    expect(src).toContain('surface: "STORES_CATEGORY_FEED"');
    expect(src).toMatch(/return projectBrowsePaidAdInsertionMetaRow\(row\.payload\)/);
    expect(src).toContain("exposureToken: token");
  });

  it("T3/T4/T5 — BROWSE consumer mounts DeliveryAdSponsoredBeacon with row exposureToken", () => {
    const src = browseViewSrc();
    expect(src).toContain('from "@/components/stores/advertising/DeliveryAdSponsoredBeacon"');
    expect(src).toContain("<DeliveryAdSponsoredBeacon");
    expect(src).toContain("exposureToken={item.row.exposureToken}");
    expect(src).toContain("campaignId={item.row.campaignId}");
    expect(src).toMatch(/item\.kind === "paid_ad" && item\.row\.exposureToken/);
  });

  it("T4/T5 — canonical beacon owns impression + click (unchanged authority)", () => {
    const src = beaconSrc();
    expect(src).toContain("useDeliveryAdImpressionObserver");
    expect(src).toContain("reportDeliveryAdClick");
    expect(src).toContain("onClickCapture");
  });

  it("T6 — organic BROWSE rows do not mount sponsored beacon", () => {
    const src = browseViewSrc();
    expect(src).toMatch(/if \(item\.kind === "organic"\)/);
    const organicBlockStart = src.indexOf('if (item.kind === "organic")');
    const organicBlock = src.slice(organicBlockStart, organicBlockStart + 450);
    expect(organicBlock).toContain("StoreBrowseCategoryRowCard");
    expect(organicBlock).not.toContain("DeliveryAdSponsoredBeacon");
  });

  it("T7 — BROWSE consumer does not issue a second token", () => {
    const src = browseViewSrc();
    expect(src).not.toContain("issueEligibleDeliveryAdExposure");
    expect(src).not.toContain("issueDeliveryAdExposureToken");
    expect(browseCardSrc()).not.toContain("issueEligibleDeliveryAdExposure");
    expect(browseCardSrc()).not.toContain("issueDeliveryAdExposureToken");
  });

  it("T8 — insertion ordering/count/policy path unchanged (plan layer)", () => {
    const organic = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [paidPayload({ id: "ad-b", storeId: "B" })],
      coupons: [],
      policy: browsePolicyAdOn(4, 5),
    });
    expect(plan.adCount).toBe(1);
    expect(plan.sponsoredStoreIds).toEqual(["B"]);
    const paidIdx = plan.rows.findIndex((r) => r.kind === "paid_ad");
    expect(paidIdx).toBeGreaterThanOrEqual(0);
    expect(plan.rows.filter((r) => r.storeId === "B")).toHaveLength(1);
    /** Projector does not reorder — same payload identity after plan. */
    const projected = projectBrowsePaidAdInsertionMetaRow(
      (plan.rows[paidIdx] as { payload: StorePaidAdCampaignRow }).payload
    );
    expect(projected.campaignId).toBe("ad-b");
    expect(projected.storeId).toBe("B");
  });

  it("T9 — StoreBrowseCategoryRowCard navigation/renderer contract preserved", () => {
    const src = browseCardSrc();
    expect(src).toContain("storeDetailHrefFromSlug");
    expect(src).toContain("navigateToDeliveryStoreCard");
    expect(src).toContain("navigateToStore");
    expect(src).not.toContain("DeliveryAdSponsoredBeacon");
    expect(src).not.toContain("exposureToken");
  });
});
