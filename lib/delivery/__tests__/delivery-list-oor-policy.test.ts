import { describe, expect, it } from "vitest";
import {
  memberDeliveryServiceabilityActive,
  resolveListDistanceOutOfRange,
  shouldExcludeStoreFromMemberDeliveryList,
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
      shouldExcludeStoreFromMemberDeliveryList({
        originSource: "saved_address",
        distanceOutOfRange: true,
        storeKind: "real",
      })
    ).toBe(true);
  });

  it("Owner 2026-10-29: 샘플은 주소 무관 노출, 주소 없는 회원은 실매장 제외", () => {
    const ex = (originSource: Parameters<typeof shouldExcludeStoreFromMemberDeliveryList>[0]["originSource"], storeKind: string, distanceOutOfRange = false) =>
      shouldExcludeStoreFromMemberDeliveryList({ originSource, storeKind, distanceOutOfRange });
    expect(ex("saved_address", "sample", true)).toBe(false);
    expect(ex("member_no_address", "sample")).toBe(false);
    expect(ex("member_no_address", "real")).toBe(true);
    expect(ex("saved_address", "real", false)).toBe(false);
    expect(ex("none", "real", true)).toBe(false);
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
