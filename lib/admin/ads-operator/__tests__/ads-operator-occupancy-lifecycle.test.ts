import { describe, expect, it } from "vitest";
import { computePlacementOccupancy } from "@/lib/admin/ads-operator/placement-occupancy";
import {
  adsCanonicalLifecycleLabel,
  deliveryLifecycleToCanonical,
  feedDisplayToCanonical,
} from "@/lib/admin/ads-operator/ads-canonical-lifecycle";
import { deriveAdsOperatorExposure } from "@/lib/admin/ads-operator/ads-operator-presentation";
import { projectFeedAdMemberPresentation } from "@/lib/ads/feed-ad-member-presentation";
import { projectFeedAdOpsProductStatus } from "@/lib/ads/feed-ad-ops-presentation";

describe("ads operator occupancy + lifecycle", () => {
  it("computes vacancy without inventing capacity DB", () => {
    const now = Date.parse("2026-09-06T12:00:00.000Z");
    const rows = computePlacementOccupancy(
      [
        {
          id: "a",
          storeId: "s1",
          storeName: "Store A",
          title: "A",
          productKind: "banner",
          inventoryKeys: ["STORES_HOME_HERO"],
          lifecycleStatus: "ACTIVE",
          startAt: "2026-09-01T00:00:00.000Z",
          endAt: "2026-09-10T00:00:00.000Z",
          creativeId: "c1",
        },
      ],
      { nowMs: now, placementKeys: ["STORES_HOME_HERO"] }
    );
    expect(rows[0]?.capacity).toBe(5);
    expect(rows[0]?.liveCount).toBe(1);
    expect(rows[0]?.vacant).toBe(4);
  });

  it("ACTIVE lifecycle ≠ exposing without eligibility", () => {
    expect(
      deriveAdsOperatorExposure({
        lifecycle: "ACTIVE",
        startAt: "2026-09-01T00:00:00.000Z",
        endAt: "2026-09-10T00:00:00.000Z",
        eligibleNow: false,
        nowMs: Date.parse("2026-09-06T12:00:00.000Z"),
      })
    ).toBe("ineligible");
  });

  it("Feed pause maps to paused for Admin+Customer parity", () => {
    const member = projectFeedAdMemberPresentation({
      requestStatus: "active",
      campaignStatus: "paused",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-20T00:00:00.000Z",
      nowMs: Date.parse("2026-09-06T12:00:00.000Z"),
    });
    expect(member.displayStatus).toBe("paused");
    expect(member.eligible).toBe(false);
    expect(
      projectFeedAdOpsProductStatus({
        requestStatus: "active",
        campaignStatus: "paused",
        campaignStartAt: "2026-09-01T00:00:00.000Z",
        campaignEndAt: "2026-09-20T00:00:00.000Z",
        nowMs: Date.parse("2026-09-06T12:00:00.000Z"),
      })
    ).toBe("paused");
    expect(feedDisplayToCanonical("paused")).toBe("paused");
    expect(adsCanonicalLifecycleLabel("paused", true)).toBe("일시중지");
  });

  it("Delivery ACTIVE → exposing canonical", () => {
    expect(deliveryLifecycleToCanonical("ACTIVE")).toBe("exposing");
  });
});
