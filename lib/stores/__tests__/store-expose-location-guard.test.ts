import { describe, expect, it } from "vitest";
import { storeMissingDeliveryLocation } from "@/lib/stores/store-expose-location-guard";
import { resolveOwnerHeaderStatusChip } from "@/lib/business/owner-header-status-chip";

/** 실기 2026-11-03 D1 — 좌표 없이 노출된 배달 매장은 손님 배달 목록 0건 */
describe("store-expose-location-guard", () => {
  it("배달 켜짐 + 좌표 없음 = 막음", () => {
    expect(storeMissingDeliveryLocation({ delivery_available: true, lat: null, lng: null })).toBe(true);
    expect(storeMissingDeliveryLocation({ delivery_available: true, lat: 14.6, lng: null })).toBe(true);
  });
  it("좌표 있음 또는 배달 꺼짐 = 통과", () => {
    expect(storeMissingDeliveryLocation({ delivery_available: true, lat: 14.676, lng: 121.0437 })).toBe(false);
    expect(storeMissingDeliveryLocation({ delivery_available: false, lat: null, lng: null })).toBe(false);
  });
  it("헤더 칩: 공개 + 좌표 없음 = 「위치 필요」, 비공개가 먼저", () => {
    expect(
      resolveOwnerHeaderStatusChip({ approvalStatus: "approved", isVisible: true, isOpen: true, missingDeliveryLocation: true })
    ).toEqual({ labelKey: "owner_header_chip_location_required", tone: "warning" });
    expect(
      resolveOwnerHeaderStatusChip({ approvalStatus: "approved", isVisible: false, isOpen: true, missingDeliveryLocation: true })
        .labelKey
    ).toBe("business_phase7_132");
  });
});
