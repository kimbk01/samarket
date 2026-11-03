import { describe, expect, it } from "vitest";
import {
  resolveStoreListingBlocker,
  storeMissingCategory,
  storeMissingDeliveryLocation,
} from "@/lib/stores/store-expose-location-guard";
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
      resolveOwnerHeaderStatusChip({ approvalStatus: "approved", isVisible: true, isOpen: true, listingBlocker: "location" })
    ).toEqual({ labelKey: "owner_header_chip_location_required", tone: "warning" });
    expect(
      resolveOwnerHeaderStatusChip({ approvalStatus: "approved", isVisible: false, isOpen: true, listingBlocker: "location" })
        .labelKey
    ).toBe("business_phase7_132");
  });
});

/** 실기 2회차 2026-11-03 P3 — 업종 없는 매장은 지정 메뉴·배달 범위가 있어도 손님 배달 목록 0건 */
describe("store category guard", () => {
  it("업종 없음 = 막음, 있음 = 통과", () => {
    expect(storeMissingCategory({ store_category_id: null })).toBe(true);
    expect(storeMissingCategory({ store_category_id: "  " })).toBe(true);
    expect(storeMissingCategory({})).toBe(true);
    expect(storeMissingCategory({ store_category_id: "cat-1" })).toBe(false);
  });
  it("목록 제외 이유 1개 — 위치가 먼저, 다음 업종", () => {
    expect(
      resolveStoreListingBlocker({ delivery_available: true, lat: null, lng: null, store_category_id: null })
    ).toBe("location");
    expect(
      resolveStoreListingBlocker({ delivery_available: true, lat: 14.6, lng: 121.0, store_category_id: null })
    ).toBe("category");
    expect(
      resolveStoreListingBlocker({ delivery_available: true, lat: 14.6, lng: 121.0, store_category_id: "c" })
    ).toBeNull();
  });
  it("헤더 칩: 공개 + 업종 없음 = 「업종 필요」", () => {
    expect(
      resolveOwnerHeaderStatusChip({ approvalStatus: "approved", isVisible: true, isOpen: true, listingBlocker: "category" })
    ).toEqual({ labelKey: "owner_header_chip_category_required", tone: "warning" });
  });
});
