import { describe, expect, it } from "vitest";
import { resolveStoreCheckoutBuyerPhoneDigits } from "@/lib/stores/resolve-store-checkout-buyer-phone";

describe("resolveStoreCheckoutBuyerPhoneDigits", () => {
  it("prefers complete phone on selected address", () => {
    expect(
      resolveStoreCheckoutBuyerPhoneDigits({
        selectedAddressPhone: "09171234567",
        profilePhone: "09987654321",
      })
    ).toBe("09171234567");
  });

  it("falls back to profile when address has no phone", () => {
    expect(
      resolveStoreCheckoutBuyerPhoneDigits({
        selectedAddressPhone: "",
        checkoutContactPhone: null,
        profilePhone: "09987654321",
      })
    ).toBe("09987654321");
  });

  it("keeps current complete digits", () => {
    expect(
      resolveStoreCheckoutBuyerPhoneDigits({
        currentDigits: "09111111111",
        profilePhone: "09987654321",
      })
    ).toBe("09111111111");
  });
});
