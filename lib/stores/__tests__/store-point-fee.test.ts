import { describe, expect, it } from "vitest";
import {
  computeStorePointFeeAmount,
  DEFAULT_STORE_POINT_POLICY,
} from "@/lib/stores/compute-store-point-fee";
import {
  isStorePointCommerceBlocked,
  resolveStoreFrontOrderable,
} from "@/lib/stores/store-point-commerce-block";

describe("computeStorePointFeeAmount", () => {
  it("fixed mode default 10", () => {
    expect(computeStorePointFeeAmount(DEFAULT_STORE_POINT_POLICY, 5000)).toBe(10);
  });

  it("percent mode", () => {
    expect(
      computeStorePointFeeAmount(
        { fee_mode: "percent", percent_rate: 3, fixed_point: 0, minimum_point: 0, maximum_point: 0 },
        1000
      )
    ).toBe(30);
  });

  it("both mode with minimum", () => {
    expect(
      computeStorePointFeeAmount(
        {
          fee_mode: "both",
          fixed_point: 5,
          percent_rate: 1,
          minimum_point: 15,
          maximum_point: 0,
        },
        100
      )
    ).toBe(15);
  });

  it("maximum cap", () => {
    expect(
      computeStorePointFeeAmount(
        { fee_mode: "percent", percent_rate: 50, minimum_point: 0, maximum_point: 20 },
        1000
      )
    ).toBe(20);
  });
});

describe("store point commerce block overlay", () => {
  it("blocked when flag set", () => {
    expect(isStorePointCommerceBlocked({ point_commerce_blocked: true })).toBe(true);
    expect(resolveStoreFrontOrderable(true, { point_commerce_blocked: true })).toBe(false);
  });

  it("orderable when schedule open and not blocked", () => {
    expect(resolveStoreFrontOrderable(true, { point_commerce_blocked: false })).toBe(true);
    expect(resolveStoreFrontOrderable(false, { point_commerce_blocked: false })).toBe(false);
  });
});
