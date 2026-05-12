import { describe, expect, it } from "vitest";
import { parseStoreDeliveryMeta } from "@/lib/stores/store-detail-meta";

describe("parseStoreDeliveryMeta", () => {
  it("drops free_delivery_over for self_free_promo even if legacy key remains in JSON", () => {
    const meta = parseStoreDeliveryMeta(
      {
        weekdays: "매일 09:00–22:00",
        delivery_fee_mode: "self_free_promo",
        delivery_fee_strike_reference_php: 100,
        free_delivery_over_php: 5000,
      },
      "—"
    );
    expect(meta.freeDeliveryOverPhp).toBeNull();
  });
});
