/**
 * 결함 3 (문서 J, LOC-004 연동): 관리자 주문 상세 「주문 당시 판정」 = 저장된 `checkout_*` 원값만.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAdminOrderCheckoutJudgement } from "@/lib/admin/store-orders/load-admin-store-order-detail";

describe("admin order checkout judgement (stored snapshot only)", () => {
  it("maps stored values as-is", () => {
    expect(
      readAdminOrderCheckoutJudgement({
        checkout_serviceability_eligible: true,
        checkout_serviceability_reason: "within_radius",
        checkout_serviceability_max_km: "5",
        checkout_store_latitude: 14.55,
        checkout_store_longitude: "121.02",
        checkout_straight_distance_meters: 1234,
      })
    ).toEqual({
      eligible: true,
      reason: "within_radius",
      maxKm: 5,
      storeLatitude: 14.55,
      storeLongitude: 121.02,
      straightDistanceMeters: 1234,
    });
  });

  it("no stored snapshot (pre-snapshot order / pickup) → null, nothing invented", () => {
    expect(readAdminOrderCheckoutJudgement({ order_status: "completed" })).toBeNull();
    expect(
      readAdminOrderCheckoutJudgement({
        checkout_serviceability_eligible: null,
        checkout_serviceability_reason: "  ",
        checkout_store_latitude: null,
      })
    ).toBeNull();
  });

  it("partial snapshot keeps missing fields null (no fallback to current store data)", () => {
    expect(readAdminOrderCheckoutJudgement({ checkout_serviceability_eligible: false })).toEqual({
      eligible: false,
      reason: null,
      maxKm: null,
      storeLatitude: null,
      storeLongitude: null,
      straightDistanceMeters: null,
    });
  });

  it("loader selects the snapshot columns from store_orders and does not re-evaluate", () => {
    const src = readFileSync("lib/admin/store-orders/load-admin-store-order-detail.ts", "utf8");
    for (const c of [
      "checkout_serviceability_eligible",
      "checkout_serviceability_reason",
      "checkout_serviceability_max_km",
      "checkout_store_latitude",
      "checkout_store_longitude",
      "checkout_straight_distance_meters",
    ]) {
      expect(src).toContain(`"${c}"`);
    }
    expect(src).not.toMatch(/evaluateDeliveryServiceArea/);
  });
});
