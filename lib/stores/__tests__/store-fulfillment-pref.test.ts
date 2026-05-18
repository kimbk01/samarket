import { describe, expect, it } from "vitest";
import { resolveStoreFulfillmentModeForEntry } from "@/lib/stores/store-fulfillment-pref";

describe("resolveStoreFulfillmentModeForEntry", () => {
  it("prefers delivery when both delivery and pickup are enabled", () => {
    expect(
      resolveStoreFulfillmentModeForEntry(
        { deliveryAvailable: true, pickupAvailable: true },
        "pickup"
      )
    ).toBe("local_delivery");
  });

  it("uses delivery only when pickup is disabled", () => {
    expect(
      resolveStoreFulfillmentModeForEntry({ deliveryAvailable: true, pickupAvailable: false }, "pickup")
    ).toBe("local_delivery");
  });

  it("uses pickup when delivery is disabled", () => {
    expect(
      resolveStoreFulfillmentModeForEntry(
        { deliveryAvailable: false, pickupAvailable: true },
        "local_delivery"
      )
    ).toBe("pickup");
  });
});
