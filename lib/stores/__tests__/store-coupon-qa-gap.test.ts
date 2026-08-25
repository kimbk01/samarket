import { describe, expect, it } from "vitest";
import { isFirstOrderTargetEligible } from "@/lib/stores/store-coupon-first-order";
import { computeEntitlementExpiresAtIso, isCouponIssueWindowOpen } from "@/lib/stores/store-coupon-usage-window";
import { parseStoreCouponCampaignCreateBody } from "@/lib/stores/store-coupon-campaign-validation";
import { filterDiscoveryCouponsForViewer } from "@/lib/stores/store-coupon-discovery-viewer";

describe("FREE COUPON QA gap fixes", () => {
  it("separates issue window from usage TTL", () => {
    const now = Date.parse("2026-08-25T00:00:00.000Z");
    expect(
      isCouponIssueWindowOpen({
        nowMs: now,
        startAtIso: "2026-08-25T00:00:00.000Z",
        endAtIso: "2026-08-31T00:00:00.000Z",
      })
    ).toBe(true);
    const expires = computeEntitlementExpiresAtIso({
      nowMs: now,
      issueEndAtIso: "2026-08-31T00:00:00.000Z",
      usageEndAtIso: "2026-09-15T00:00:00.000Z",
      claimValidDays: 7,
    });
    expect(expires.startsWith("2026-09-01")).toBe(true);
  });

  it("blocks first-order after completed history", () => {
    expect(
      isFirstOrderTargetEligible({
        scope: "STORE",
        hasCompletedOrderAtStore: true,
        hasCompletedOrderOnPlatform: true,
      })
    ).toBe(false);
    expect(
      isFirstOrderTargetEligible({
        scope: null,
        hasCompletedOrderAtStore: true,
        hasCompletedOrderOnPlatform: true,
      })
    ).toBe(true);
  });

  it("accepts owner budget fields on create", () => {
    const parsed = parseStoreCouponCampaignCreateBody({
      storeId: "s1",
      title: "t",
      discountType: "percent",
      discountValue: 10,
      startAt: "2026-08-25T00:00:00.000Z",
      endAt: "2026-09-25T00:00:00.000Z",
      spendBudgetPhp: 1000,
      maxDiscount: 100,
      issueLimit: 50,
      firstOrderScope: "STORE",
      claimValidDays: 7,
      fundingMode: "STORE_FUNDED",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.maxDiscount).toBe(100);
      expect(parsed.value.issueLimit).toBe(50);
      expect(parsed.value.firstOrderScope).toBe("STORE");
    }
  });

  it("hides discovery coupon when viewer already used first-order campaign", () => {
    const out = filterDiscoveryCouponsForViewer(
      [
        {
          id: "c1",
          storeId: "s1",
          title: "t",
          discountType: "fixed_amount",
          discountValue: 100,
          minOrderAmount: 700,
          termsCopy: null,
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: "2026-12-01T00:00:00.000Z",
          isActive: true,
          firstOrderScope: "STORE",
        },
      ],
      {
        completedStoreIds: new Set(["s1"]),
        hasCompletedOrderOnPlatform: true,
        blockedCampaignIds: new Set(),
      }
    );
    expect(out).toHaveLength(0);
  });

  it("snapshot browse attach uses the same viewer coupon context as live browse", async () => {
    const fs = await import("node:fs");
    const snap = fs.readFileSync("lib/stores/stores-browse-snapshot.ts", "utf8");
    const live = fs.readFileSync("lib/stores/composition/stores-composition-browse-insertion-meta.ts", "utf8");
    expect(snap).toContain("viewerUserId: ctx.viewerUserId");
    expect(live).toContain("loadViewerCouponDiscoveryContext");
    expect(live).toContain("filterDiscoveryCouponsForViewer");
  });
});
