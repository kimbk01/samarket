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
    };
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "community_messenger_messages") return messagesTable;
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
  });
});
