import { describe, expect, it, beforeEach } from "vitest";
import {
  invalidateOwnerStoreOrdersListCache,
  peekOwnerStoreOrdersListCache,
  seedOwnerStoreOrdersListCacheFromJson,
} from "./owner-store-orders-list-cache";
import {
  invalidateOwnerHubDashboardOrdersCache,
  seedOwnerHubDashboardOrdersCache,
} from "./owner-hub-dashboard-orders-cache";

const STORE = "store-a";

describe("owner-store-orders-list-cache", () => {
  beforeEach(() => {
    invalidateOwnerStoreOrdersListCache();
    invalidateOwnerHubDashboardOrdersCache();
  });

  it("parses and stores items arrays from list API json", () => {
    seedOwnerStoreOrdersListCacheFromJson(STORE, {
      ok: true,
      meta: {
        pending_accept_count: 0,
        refund_requested_count: 0,
        pending_delivery_count: 0,
      },
      orders: [
        {
          id: "o1",
          order_no: "1",
          buyer_user_id: "u1",
          total_amount: 100,
          payment_amount: 100,
          payment_status: "paid",
          order_status: "pending",
          fulfillment_type: "pickup",
          buyer_note: null,
          created_at: new Date().toISOString(),
        },
      ],
    });
    const peek = peekOwnerStoreOrdersListCache(STORE);
    expect(peek?.orders[0]?.items).toEqual([]);
  });

  it("does not read hub timeline cache", () => {
    seedOwnerHubDashboardOrdersCache(STORE, {
      orders: [
        {
          id: "o1",
          order_no: "1",
          buyer_user_id: "u1",
          payment_amount: 100,
          payment_status: "paid",
          order_status: "pending",
          created_at: new Date().toISOString(),
        },
      ],
      meta: { pending_accept_count: 1, refund_requested_count: 0, pending_delivery_count: 0 },
    });
    expect(peekOwnerStoreOrdersListCache(STORE)).toBeNull();
  });
});
