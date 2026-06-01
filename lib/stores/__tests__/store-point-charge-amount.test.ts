import { describe, expect, it } from "vitest";
import {
  computeStorePointChargePaymentAmount,
  STORE_POINT_CHARGE_PAYMENT_RATIO,
} from "@/lib/stores/store-point-charge-amount";

describe("store-point-charge-amount", () => {
  it("uses 1:1 ratio by default", () => {
    expect(STORE_POINT_CHARGE_PAYMENT_RATIO).toBe(1);
    expect(computeStorePointChargePaymentAmount(500)).toBe(500);
    expect(computeStorePointChargePaymentAmount(0)).toBe(0);
  });
});
