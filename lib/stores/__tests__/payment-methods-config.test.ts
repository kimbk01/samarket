import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_LEGACY_COD_DISPLAY_STRINGS,
  checkoutPaymentOptionsForCart,
  formatBuyerPaymentDisplay,
  formatPaymentMethodsDisplayLine,
  labelCheckoutPaymentMethod,
  normalizeCheckoutPaymentMethodId,
  readPaymentMethodsFormValues,
} from "@/lib/stores/payment-methods-config";

describe("payment-methods-config COD", () => {
  it("labels cod as COD in ko", () => {
    expect(labelCheckoutPaymentMethod("cod", "ko")).toBe("COD");
    expect(labelCheckoutPaymentMethod("cash_on_delivery", "ko")).toBe("COD");
  });

  it("normalizes legacy payment ids to cod", () => {
    expect(normalizeCheckoutPaymentMethodId("cash_on_delivery")).toBe("cod");
    expect(normalizeCheckoutPaymentMethodId("cash_meet")).toBe("cod");
    expect(normalizeCheckoutPaymentMethodId("cod")).toBe("cod");
    expect(normalizeCheckoutPaymentMethodId("gcash")).toBe("gcash");
  });

  it("formatBuyerPaymentDisplay uses COD for legacy orders", () => {
    expect(formatBuyerPaymentDisplay("cash_on_delivery", null, "ko")).toBe("COD");
    expect(formatBuyerPaymentDisplay("cod", null, "en")).toBe("COD");
  });

  it("store payment line uses COD not legacy meet-up copy", () => {
    const v = readPaymentMethodsFormValues({
      payment_methods_config: { gcash: true, cash_meet: true },
    });
    const line = formatPaymentMethodsDisplayLine(v, "ko");
    expect(line).toContain("COD");
    expect(line).not.toContain("만나서");
    for (const forbidden of FORBIDDEN_LEGACY_COD_DISPLAY_STRINGS) {
      expect(line).not.toContain(forbidden);
    }
  });

  it("cart checkout options expose COD label for cash_meet config", () => {
    const opts = checkoutPaymentOptionsForCart({
      payment_methods_config: { cash_meet: true },
    });
    expect(opts.some((o) => o.id === "cod" && o.label === "COD")).toBe(true);
  });
});
