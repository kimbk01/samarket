import { describe, expect, it, beforeEach } from "vitest";
import {
  invalidateOwnerHubDashboardOrdersCache,
  peekOwnerHubDashboardOrdersCache,
  seedOwnerHubDashboardOrdersCache,
} from "./owner-hub-dashboard-orders-cache";
import { invalidateOwnerStoreOrdersListCache } from "@/lib/delivery/owner/owner-store-orders-list-cache";

const STORE = "store-a";

describe("owner-hub-dashboard-orders-cache", () => {
  beforeEach(() => {
    invalidateOwnerHubDashboardOrdersCache();
    invalidateOwnerStoreOrdersListCache();
  });

  it("hub timeline seed has no items field", () => {
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
    const peek = peekOwnerHubDashboardOrdersCache(STORE);
    expect(peek?.orders[0]).not.toHaveProperty("items");
  });
});
