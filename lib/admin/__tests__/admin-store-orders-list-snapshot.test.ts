import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_STORE_ORDERS_LIST_SNAPSHOT_RPC,
  tryLoadAdminStoreOrdersListFromSnapshot,
} from "@/lib/admin/admin-store-orders-list-snapshot";

describe("admin-store-orders-list-snapshot", () => {
  it("calls snapshot RPC with filter params", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        orders: [
          {
            order: {
              id: "o1",
              order_no: "A-1",
              buyer_user_id: "u1",
              store_id: "s1",
              payment_amount: 1000,
              payment_status: "paid",
              order_status: "pending",
              fulfillment_type: "delivery",
              created_at: "2026-01-01T00:00:00.000Z",
            },
            store_name: "Store",
            store_slug: "store",
            store_owner_user_id: "owner1",
            buyer_display_name: "Buyer",
            store_owner_name: "Owner",
          },
        ],
      },
      error: null,
    });
    const sb = { rpc } as unknown as Parameters<typeof tryLoadAdminStoreOrdersListFromSnapshot>[0];

    const result = await tryLoadAdminStoreOrdersListFromSnapshot(sb, {
      limit: 100,
      includeItems: false,
      orderStatus: "pending",
    });

    expect(rpc).toHaveBeenCalledWith(ADMIN_STORE_ORDERS_LIST_SNAPSHOT_RPC, {
      p_order_id: null,
      p_order_no: "",
      p_store_id: null,
      p_buyer_user_id: null,
      p_payment_status: "",
      p_order_status: "pending",
      p_limit: 100,
      p_include_items: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]?.order_no).toBe("A-1");
    }
  });

  it("returns rpc_missing when function not deployed", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Could not find the function public.get_admin_store_orders_list_snapshot" },
      }),
    } as unknown as Parameters<typeof tryLoadAdminStoreOrdersListFromSnapshot>[0];

    const result = await tryLoadAdminStoreOrdersListFromSnapshot(sb, {
      limit: 50,
      includeItems: false,
    });
    expect(result).toEqual({ ok: false, reason: "rpc_missing" });
  });
});
