import { describe, expect, it } from "vitest";
import {
  memberDeliveryServiceabilityActive,
  resolveListDistanceOutOfRange,
  shouldExcludeOutOfRangeFromNormalList,
} from "@/lib/delivery/delivery-list-oor-policy";

describe("delivery-list-oor-policy", () => {
  it("member master origin activates serviceability list flags", () => {
    expect(memberDeliveryServiceabilityActive("saved_address")).toBe(true);
    expect(memberDeliveryServiceabilityActive("explicit_coords")).toBe(false);
    expect(memberDeliveryServiceabilityActive("none")).toBe(false);
  });

  it("guest GPS never becomes list OOR", () => {
    expect(
      resolveListDistanceOutOfRange({
        originSource: "explicit_coords",
        serviceabilityApplies: true,
        reason: "out_of_range",
      })
    ).toBe(false);
  });

  it("member out_of_range is list OOR and excluded from normal lists", () => {
    expect(
      resolveListDistanceOutOfRange({
        originSource: "saved_address",
        serviceabilityApplies: true,
        reason: "out_of_range",
      })
    ).toBe(true);
    expect(
      shouldExcludeOutOfRangeFromNormalList({
        originSource: "saved_address",
        distanceOutOfRange: true,
      })
    ).toBe(true);
  });

  it("missing_customer_coords is not list OOR", () => {
    expect(
      resolveListDistanceOutOfRange({
        originSource: "saved_address",
        serviceabilityApplies: true,
        reason: "missing_customer_coords",
      })
    ).toBe(false);
  });
});
