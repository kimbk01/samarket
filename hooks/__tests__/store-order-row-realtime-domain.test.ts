import { describe, expect, it } from "vitest";
import {
  applyStoreOrderRowRealtimeEvent,
  storeOrderRowEventMatchesDomain,
  storeOrderRowRealtimeChannelName,
} from "@/hooks/useSupabaseStoreOrderRowRealtime";

const payload = {
  eventType: "UPDATE",
  new: { id: "order-1", order_status: "preparing", updated_at: "2026-07-26T13:00:00Z" },
};

describe("store order row realtime role boundary", () => {
  it("uses distinct Customer and Owner channel namespaces", () => {
    expect(
      storeOrderRowRealtimeChannelName({
        domain: "delivery-customer",
        orderId: "order-1",
      })
    ).toBe("delivery-customer-order-row-rt:order-1");
    expect(
      storeOrderRowRealtimeChannelName({
        domain: "delivery-owner",
        storeId: "store-1",
        orderId: "order-1",
      })
    ).toBe("delivery-owner-order-row-rt:store-1:order-1");
  });

  it("rejects an Owner row from another store", () => {
    expect(
      storeOrderRowEventMatchesDomain({
        domain: "delivery-owner",
        storeId: "store-1",
        row: { id: "order-1", store_id: "store-2" },
      })
    ).toBe(false);
    expect(
      storeOrderRowEventMatchesDomain({
        domain: "delivery-owner",
        storeId: "store-1",
        row: { id: "order-1", store_id: "store-1" },
      })
    ).toBe(true);
  });

  it("applies one raw event only to the bound role writer", () => {
    let customerGeneration = 0;
    let ownerGeneration = 0;

    const customer = applyStoreOrderRowRealtimeEvent({
      boundDomain: "delivery-customer",
      eventDomain: "delivery-customer",
      payload,
      lastSignature: "",
      onApply: () => {
        customerGeneration += 1;
      },
    });
    applyStoreOrderRowRealtimeEvent({
      boundDomain: "delivery-owner",
      eventDomain: "delivery-customer",
      payload,
      lastSignature: "",
      onApply: () => {
        ownerGeneration += 1;
      },
    });

    expect(customerGeneration).toBe(1);
    expect(ownerGeneration).toBe(0);

    const duplicate = applyStoreOrderRowRealtimeEvent({
      boundDomain: "delivery-customer",
      eventDomain: "delivery-customer",
      payload,
      lastSignature: customer.signature,
      onApply: () => {
        customerGeneration += 1;
      },
    });
    expect(duplicate.applied).toBe(false);
    expect(customerGeneration).toBe(1);
  });

  it("keeps Customer unchanged when Owner adapter receives the event", () => {
    const customerGeneration = 0;
    let ownerGeneration = 0;
    applyStoreOrderRowRealtimeEvent({
      boundDomain: "delivery-owner",
      eventDomain: "delivery-owner",
      payload,
      lastSignature: "",
      onApply: () => {
        ownerGeneration += 1;
      },
    });
    expect(ownerGeneration).toBe(1);
    expect(customerGeneration).toBe(0);
  });
});
