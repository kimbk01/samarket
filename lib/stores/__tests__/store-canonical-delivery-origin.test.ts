import { describe, expect, it } from "vitest";
import { storeHasCanonicalDeliveryOrigin } from "@/lib/stores/store-canonical-delivery-origin";

describe("storeHasCanonicalDeliveryOrigin", () => {
  it("requires both finite lat and lng", () => {
    expect(storeHasCanonicalDeliveryOrigin(14.6, 121.0)).toBe(true);
    expect(storeHasCanonicalDeliveryOrigin("14.6", "121.0")).toBe(true);
    expect(storeHasCanonicalDeliveryOrigin(null, 121)).toBe(false);
    expect(storeHasCanonicalDeliveryOrigin(14.6, null)).toBe(false);
    expect(storeHasCanonicalDeliveryOrigin("", "")).toBe(false);
    expect(storeHasCanonicalDeliveryOrigin(91, 121)).toBe(false);
  });
});
