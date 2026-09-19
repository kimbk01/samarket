/**
 * CUT B — Admin consumer wiring for effective lifecycle SSOT.
 * No customer loader changes; presentation-only contract.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectAdsEffectiveLifecycle } from "@/lib/admin/ads-exposure/ops-status";
import { promoteOrderOpsStatus } from "@/lib/admin/ads-control-plane/project-family-rows";
import { isFeedAdCampaignEligibleNow } from "@/lib/ads/feed-ad-placement";
import { isLiveTradePromotionEntitlement } from "@/lib/promotion/feed-promotion-projection";

const ROOT = path.resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("CUT B Admin consumers", () => {
  const now = Date.parse("2026-09-19T13:36:00.000Z");

  it("AdminFeedAdsListPage does not set eligibleNow from raw status===active", () => {
    const src = read("components/admin/ads/AdminFeedAdsListPage.tsx");
    expect(src).toContain("projectAdsEffectiveLifecycle");
    expect(src).not.toMatch(/eligibleNow:\s*c\.status\s*===\s*["']active["']/);
    expect(src).toContain('endBoundary: "exclusive"');
  });

  it("AdminCommunityPromotionQueue binds effective label (not raw orderStatus alone)", () => {
    const src = read("components/admin/ads/AdminCommunityPromotionQueue.tsx");
    expect(src).toContain("projectAdsEffectiveLifecycle");
    expect(src).toContain("adsOpsStatusLabel");
    expect(src).toContain('endBoundary: "inclusive"');
    expect(src).toContain("data-effective-status");
    // Must not present raw orderStatus as the sole status token in the meta line.
    expect(src).not.toMatch(/· \{row\.orderStatus\}/);
  });

  it("Feed expired active: Admin eligibleNow false agrees with customer loader", () => {
    const startAt = "2026-09-05T03:19:00.054Z";
    const endAt = "2026-09-08T03:19:00.054Z";
    const eff = projectAdsEffectiveLifecycle({
      rawStatus: "active",
      startAt,
      endAt,
      nowMs: now,
      endBoundary: "exclusive",
    });
    expect(eff.storedStatus).toBe("active");
    expect(eff.effectiveStatus).toBe("ended");
    expect(eff.customerEligibleNow).toBe(false);
    expect(
      isFeedAdCampaignEligibleNow({ status: "active", startAt, endAt }, now)
    ).toBe(false);
  });

  it("Boost expired active: Admin effective ended agrees with customer entitlement", () => {
    const startAt = "2026-08-07T14:18:30.803Z";
    const endAt = "2026-08-14T14:18:30.803Z";
    const eff = projectAdsEffectiveLifecycle({
      rawStatus: "active",
      startAt,
      endAt,
      nowMs: now,
      endBoundary: "inclusive",
    });
    expect(eff.effectiveStatus).toBe("ended");
    expect(eff.customerEligibleNow).toBe(false);
    expect(
      isLiveTradePromotionEntitlement({
        orderStatus: "active",
        startAt,
        endAt,
        nowMs: now,
      })
    ).toBe(false);
    expect(
      promoteOrderOpsStatus({
        order_status: "active",
        start_at: startAt,
        end_at: endAt,
      })
    ).toBe("ended");
  });

  it("Trade overview promoActive count uses live window (홍보중 = current-live)", () => {
    const src = read("lib/admin-products/admin-trade-overview-counts.ts");
    expect(src).toContain('.eq("order_status", "active")');
    expect(src).toContain(".lte(\"start_at\", nowIso)");
    expect(src).toContain(".gte(\"end_at\", nowIso)");
    const list = read("lib/admin-products/admin-posts-management-data.ts");
    expect(list).toContain(".lte(\"start_at\", nowIso)");
    expect(list).toContain(".gte(\"end_at\", nowIso)");
  });

  it("customer loader eligibility files unchanged in meaning (regression anchors)", () => {
    const feed = read("lib/ads/feed-ad-placement.ts");
    expect(feed).toContain("isFeedAdCampaignEligibleNow");
    expect(feed).toMatch(/t <= nowMs/);
    const boost = read("lib/promotion/feed-promotion-projection.ts");
    expect(boost).toContain("isLiveTradePromotionEntitlement");
    expect(boost).toMatch(/end >= now/);
  });
});
