import { describe, expect, it } from "vitest";
import { buildBrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { formatBrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";

const baseCtx = {
  deliveryAvailable: true,
  rideMinutes: null as number | null,
  routeContextPresent: true,
  deliveryRideTimeSource: "google",
};

describe("formatBrowseStoreRowLabels", () => {
  it("formats ko courier fee without leaking i18n keys", () => {
    const commerce = buildBrowseStoreCommerceSnapshot({
      delivery_fee_mode: "courier",
      delivery_courier_label: "Lalamove",
      prep_time_minutes: 10,
      payment_methods_config: { gcash: true, cash_meet: true, bank_transfer: true },
    });
    const labels = formatBrowseStoreRowLabels("ko", commerce, baseCtx);
    expect(labels.deliveryFeeLabel).toBe("배달비: Lalamove");
    expect(labels.deliveryFeeLabel).not.toContain("store_delivery_fee");
    expect(labels.paymentMethodsLine).toContain("COD");
    expect(labels.paymentMethodsLine).not.toContain("만나서 현금");
    expect(labels.etaLabel).toContain("조리");
    expect(labels.minOrderLabel).toBeNull();
  });

  it("formats en from same commerce snapshot", () => {
    const commerce = buildBrowseStoreCommerceSnapshot({
      delivery_fee_mode: "courier",
      delivery_courier_label: "Lalamove",
      prep_time_minutes: 10,
      min_order_php: 1000,
      payment_methods_config: { gcash: true, cash_meet: true, bank_transfer: true },
    });
    const labels = formatBrowseStoreRowLabels("en", commerce, baseCtx);
    expect(labels.deliveryFeeLabel).toBe("Delivery fee: Lalamove");
    expect(labels.paymentMethodsLine).toContain("COD");
    expect(labels.paymentMethodsLine).not.toContain("Cash on meet-up");
    expect(labels.etaLabel).toMatch(/Prep|Cook/i);
    expect(labels.minOrderLabel).toMatch(/Minimum order/i);
  });

  it("drops courier label when DB contains an i18n key slug", () => {
    const commerce = buildBrowseStoreCommerceSnapshot({
      delivery_fee_mode: "courier",
      delivery_courier_label: "store_delivery_fee_courier_colon",
    });
    const labels = formatBrowseStoreRowLabels("ko", commerce, baseCtx);
    expect(labels.deliveryFeeLabel).toBe("배달비 착불");
    expect(labels.deliveryFeeLabel).not.toContain("store_");
  });
});
