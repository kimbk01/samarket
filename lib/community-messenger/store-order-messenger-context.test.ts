import { describe, expect, it } from "vitest";
import { buildMessengerContextMetaFromStoreOrder } from "@/lib/community-messenger/store-order-messenger-context";

describe("buildMessengerContextMetaFromStoreOrder", () => {
  it("uses delivery kind for local_delivery", () => {
    const m = buildMessengerContextMetaFromStoreOrder({
      fulfillmentType: "local_delivery",
      productTitle: "라면",
      paymentAmount: 150,
      orderStatusLabel: "배송 중",
    });
    expect(m.kind).toBe("delivery");
    expect(m.headline).toBe("라면");
    expect(m.stepLabel).toBe("배송 중");
    expect(m.priceLabel).toBeDefined();
  });

  it("defaults to trade for pickup", () => {
    const m = buildMessengerContextMetaFromStoreOrder({
      fulfillmentType: "pickup",
      productTitle: "커피",
    });
    expect(m.kind).toBe("trade");
  });
});
