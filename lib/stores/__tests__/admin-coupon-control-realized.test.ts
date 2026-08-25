import { describe, expect, it } from "vitest";
import {
  assembleCouponControlCampaignView,
  couponControlActionsForLifecycle,
  projectCouponControlOrderFact,
  summarizeCouponControlRealized,
} from "@/lib/stores/admin-coupon-control-realized";

describe("admin coupon control realized projection", () => {
  it("uses order funding snapshots, not reserved spend or percent math", () => {
    const row = projectCouponControlOrderFact({
      order_id: "ff15dfa6-36d2-4577-a60e-a6f5312ddb9c",
      order_no: "SO1787662467219f980",
      order_status: "completed",
      discount_amount: 100,
      store_funded_amount: 100,
      platform_funded_amount: 0,
      net_settlement_amount: 1714,
      settlement_status: "scheduled",
    });
    expect(row.store_funded_amount).toBe(100);
    expect(row.platform_funded_amount).toBe(0);
    expect(row.net_settlement_amount).toBe(1714);
    const tot = summarizeCouponControlRealized([row]);
    expect(tot).toEqual({
      customer_discount: 100,
      store_funded: 100,
      platform_funded: 0,
    });
  });

  it("does not derive SHARED realized amounts from campaign ratio", () => {
    const tot = summarizeCouponControlRealized([
      projectCouponControlOrderFact({
        order_id: "o1",
        order_no: "SO1",
        discount_amount: 100,
        store_funded_amount: 60,
        platform_funded_amount: 40,
      }),
    ]);
    expect(tot.store_funded).toBe(60);
    expect(tot.platform_funded).toBe(40);
  });
});

describe("assembleCouponControlCampaignView", () => {
  it("keeps reserved budget separate from realized order funding", () => {
    const view = assembleCouponControlCampaignView({
      campaign: {
        id: "c1",
        store_id: "s1",
        title: "QA",
        is_active: true,
        lifecycle_state: "active",
        funding_mode: "STORE_FUNDED",
        discount_type: "fixed_amount",
        discount_value: 100,
        issued_count: 1,
        reserved_spend_php: 0,
        spend_budget_php: 20000,
      },
      storeName: "나의 오른손딸방",
      claimedCount: 1,
      redeemedCount: 1,
      orders: [
        projectCouponControlOrderFact({
          order_id: "o",
          order_no: "SO1787662467219f980",
          discount_amount: 100,
          store_funded_amount: 100,
          platform_funded_amount: 0,
          net_settlement_amount: 1714,
        }),
      ],
      audits: [],
    });
    expect(view.reserved_spend_php).toBe(0);
    expect(view.realized.store_funded).toBe(100);
    expect(view.store_name).toBe("나의 오른손딸방");
  });
});

describe("admin coupon control CTA surface", () => {
  it("keeps revoke off primary and hides invalid actions", () => {
    expect(couponControlActionsForLifecycle("active")).toMatchObject({
      approve: false,
      pause: true,
      resume: false,
      revoke: true,
    });
    expect(couponControlActionsForLifecycle("paused")).toMatchObject({
      resume: true,
      pause: false,
    });
    expect(couponControlActionsForLifecycle("revoked")).toMatchObject({
      revoke: false,
      approve: false,
    });
  });
});
