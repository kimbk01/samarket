import { describe, expect, it, vi } from "vitest";
import {
  buildMessengerContextInputFromStoreOrderSnapshot,
  buildMessengerContextMetaFromStoreOrder,
} from "@/lib/community-messenger/store-order-messenger-context";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";

describe("store order messenger context meta", () => {
  it("uses buyer-facing stepLabel not raw db status", () => {
    const meta = buildMessengerContextMetaFromStoreOrder(
      buildMessengerContextInputFromStoreOrderSnapshot({
        orderId: "ord-1",
        storeName: "Test Store",
        orderNo: "1001",
        storeId: "st-1",
        fulfillmentType: "local_delivery",
        orderStatus: "preparing",
        paymentAmount: 500,
      })
    );
    expect(meta.kind).toBe("delivery");
    expect(meta.stepLabel).toBe(BUYER_ORDER_STATUS_LABEL.preparing);
    expect(meta.stepLabel).not.toBe("preparing");
  });
});

describe("appendStoreOrderMessengerOrderSummaryIfNeeded idempotency", () => {
  it("skips insert when summary message already exists", async () => {
    const insert = vi.fn();
    const messageUpdate = vi.fn(() => ({
      eq: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
    }));
    const roomUpdate = vi.fn(() => ({
      eq: async () => ({ data: null, error: null }),
    }));
    const messagesTable = {
      select: () => ({
        eq: () => ({
          eq: () => ({
            filter: () => ({
              filter: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { id: "msg-1" }, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
      insert,
      update: messageUpdate,
    };
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "community_messenger_messages") return messagesTable;
        if (table === "community_messenger_rooms") {
          return {
            update: roomUpdate,
          };
        }
        if (table === "store_orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "ord-1",
                    order_no: "1001",
                    order_status: "pending",
                    fulfillment_type: "local_delivery",
                    payment_amount: 120,
                    total_amount: 120,
                    created_at: "2026-05-20T00:00:00.000Z",
                    stores: { store_name: "Store" },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "store_order_items") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  {
                    product_title_snapshot: "Coffee",
                    price_snapshot: 120,
                    qty: 1,
                    subtotal: 120,
                    options_snapshot_json: null,
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === "store_order_events") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }),
    };
    const { appendStoreOrderMessengerOrderSummaryIfNeeded } = await import(
      "@/lib/community-messenger/store-order-chat-service"
    );
    await appendStoreOrderMessengerOrderSummaryIfNeeded(sb as never, "ord-1", {
      ok: true,
      roomId: "room-1",
      buyerUserId: "buyer",
      ownerUserId: "owner",
      orderStatus: "pending",
      orderFlow: "delivery",
      storeName: "Store",
      orderNo: "1",
    });
    expect(insert).not.toHaveBeenCalled();
    expect(messageUpdate).toHaveBeenCalled();
    expect(roomUpdate).toHaveBeenCalled();
  });
});
