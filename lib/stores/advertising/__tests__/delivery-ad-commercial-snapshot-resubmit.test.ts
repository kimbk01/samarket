/**
 * Stage 1 — commercial snapshot reuse on resubmit / duplicate submit.
 * UNIQUE (campaign_id, product_kind) must not block CHANGES_REQUESTED → SUBMITTED.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const quoteDeliveryAdApplicationCommercial = vi.fn();
const insertCampaignCommercialSnapshot = vi.fn();
const prepareOwnerPaidCampaignSnapshotFromQuote = vi.fn();

vi.mock("@/lib/stores/advertising/delivery-ad-commercial-catalog", () => ({
  quoteDeliveryAdApplicationCommercial: (...args: unknown[]) =>
    quoteDeliveryAdApplicationCommercial(...args),
  insertCampaignCommercialSnapshot: (...args: unknown[]) =>
    insertCampaignCommercialSnapshot(...args),
  prepareOwnerPaidCampaignSnapshotFromQuote: (...args: unknown[]) =>
    prepareOwnerPaidCampaignSnapshotFromQuote(...args),
}));

import { attachOwnerPaidCommercialSnapshotOnSubmit } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";

describe("commercial snapshot resubmit reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quoteDeliveryAdApplicationCommercial.mockResolvedValue({
      ok: true,
      finalPayableMinor: 12000,
      currency: "PHP",
      packageId: "pkg-1",
      packageCode: "7_day",
      packageDisplayName: "7 day",
      durationDays: 7,
      basePriceMinor: 12000,
      partnerMembershipId: null,
      partnerDiscountPercent: 0,
      partnerBenefit: null,
      pricedAt: new Date().toISOString(),
      commercialStatus: "PRICED",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      campaignSource: "OWNER_PAID",
    });
    prepareOwnerPaidCampaignSnapshotFromQuote.mockReturnValue({
      campaignId: "camp-1",
      productKind: "store_sponsored",
      packageId: "pkg-1",
      finalPayableMinor: 12000,
    });
  });

  it("reuses matching snapshot on unique violation (resubmit / duplicate submit)", async () => {
    insertCampaignCommercialSnapshot.mockResolvedValue({
      ok: false,
      error: 'duplicate key value violates unique constraint "delivery_ad_campaign_commercial_snapshots_campaign_uidx"',
    });

    const sb = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { package_id: "pkg-1", final_payable_minor: 12000, currency: "PHP" },
            error: null,
          }),
        };
      },
    };

    const res = await attachOwnerPaidCommercialSnapshotOnSubmit(sb as never, {
      campaignId: "camp-1",
      storeId: "store-1",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      packageId: "pkg-1",
      clientFinalPayableMinor: 12000,
    });

    expect(res).toEqual({
      ok: true,
      finalPayableMinor: 12000,
      currency: "PHP",
      packageId: "pkg-1",
    });
  });

  it("fails quote_stale when existing snapshot payable mismatches", async () => {
    insertCampaignCommercialSnapshot.mockResolvedValue({
      ok: false,
      error: "23505 unique_violation",
    });

    const sb = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { package_id: "pkg-1", final_payable_minor: 99999, currency: "PHP" },
            error: null,
          }),
        };
      },
    };

    const res = await attachOwnerPaidCommercialSnapshotOnSubmit(sb as never, {
      campaignId: "camp-1",
      storeId: "store-1",
      productKind: "store_sponsored",
      inventoryKey: "STORES_HOME_FEED",
      packageId: "pkg-1",
      clientFinalPayableMinor: 12000,
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("quote_stale");
    expect(res.quoteError).toBe("existing_snapshot_mismatch");
  });
});
