import { describe, expect, it } from "vitest";
import {
  deliveryConsumerStackDepth,
  isDeliveryConsumerStackPath,
} from "@/lib/stores/delivery-consumer-stack-slide";

describe("deliveryConsumerStackDepth", () => {
  it("maps hub / browse / store / deeper", () => {
    expect(deliveryConsumerStackDepth("/stores")).toBe(0);
    expect(deliveryConsumerStackDepth("/stores/browse/restaurant")).toBe(1);
    expect(deliveryConsumerStackDepth("/stores/browse/cafe?sub=all")).toBe(1);
    expect(deliveryConsumerStackDepth("/stores/search")).toBe(1);
    expect(deliveryConsumerStackDepth("/stores/aa11")).toBe(2);
    expect(deliveryConsumerStackDepth("/stores/aa11/cart")).toBe(3);
    expect(deliveryConsumerStackDepth("/stores/cart")).toBe(2);
  });

  it("excludes owner / apply / non-stores", () => {
    expect(deliveryConsumerStackDepth("/stores/owner")).toBe(-1);
    expect(deliveryConsumerStackDepth("/stores/owner/orders")).toBe(-1);
    expect(deliveryConsumerStackDepth("/stores/owner/apply")).toBe(-1);
    expect(deliveryConsumerStackDepth("/market")).toBe(-1);
    expect(isDeliveryConsumerStackPath("/stores")).toBe(true);
    expect(isDeliveryConsumerStackPath("/stores/owner")).toBe(false);
  });
});
