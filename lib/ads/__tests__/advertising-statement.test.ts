import { describe, expect, it } from "vitest";
import {
  assertStatementRoleMaskContract,
  maskAdvertisingStatement,
  statementFromDeliveryCampaign,
  statementFromPointPromotionOrder,
} from "@/lib/ads/advertising-statement";

describe("Advertising Statement adapter", () => {
  it("role mask hides internal memo for member/owner; admin keeps it", () => {
    const base = statementFromPointPromotionOrder({
      id: "ord-1",
      domain: "community",
      product_id: "community_promote_3",
      placement: "community_top_pin",
      user_id: "u1",
      user_nickname: "Sam",
      target_id: "post-1",
      target_title: "Hello",
      order_status: "pending_review",
      point_cost: 10000,
      duration_days: 3,
      start_at: "2026-09-01T00:00:00.000Z",
      end_at: "2026-09-04T00:00:00.000Z",
      review_reason: null,
      created_at: "2026-09-01T00:00:00.000Z",
    });
    base.internalMemos = [
      { adminId: "admin-1", memo: "check creative", createdAt: "2026-09-01T01:00:00.000Z" },
    ];

    const admin = maskAdvertisingStatement(base, "admin");
    const member = maskAdvertisingStatement(base, "member");
    const owner = maskAdvertisingStatement(base, "owner");

    expect("internalMemos" in admin && admin.internalMemos.length).toBe(1);
    expect("internalMemos" in member).toBe(false);
    expect("internalMemos" in owner).toBe(false);

    expect(member.adId).toBe(admin.adId);
    expect(member.finalPrice).toBe(admin.finalPrice);
    expect(member.placement).toBe(admin.placement);
    expect(member.currentStatus).toBe(admin.currentStatus);
    expect(member.paymentStatus).toBe("HOLD");
  });

  it("delivery mapper preserves placement + money facts for all roles", () => {
    const s = statementFromDeliveryCampaign({
      campaignId: "c1",
      productKind: "banner",
      inventoryKey: "STORES_HOME_HERO",
      source: "OWNER",
      storeId: "st1",
      storeName: "Sam Chicken",
      lifecycleStatus: "ACTIVE",
      finalPriceMinor: 100000,
      currency: "PHP",
      paymentStatus: "PAID",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-10T00:00:00.000Z",
    });
    const member = maskAdvertisingStatement(s, "member");
    const owner = maskAdvertisingStatement(s, "owner");
    expect(owner.placement).toBe("STORES_HOME_HERO");
    expect(owner.finalPrice).toBe(100000);
    expect(member.finalPrice).toBe(owner.finalPrice);
    expect(assertStatementRoleMaskContract().memberOwnerHideInternalMemo).toBe(true);
  });
});
