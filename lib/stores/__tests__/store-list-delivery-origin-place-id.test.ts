import { describe, expect, it } from "vitest";
import { isSameDeliveryAddressForList } from "@/lib/stores/store-list-delivery-origin";

describe("isSameDeliveryAddressForList place_id contract", () => {
  it("does not treat placeId equality alone as same delivery address", () => {
    const same = isSameDeliveryAddressForList(
      {
        source: "saved_address",
        userId: "u1",
        addressId: "a1",
        placeId: "ChIJ-shared-poi",
        lat: 14.586,
        lng: 121.061,
        addressIdentity: null,
        cacheKeyPart: "x",
      },
      {
        place_id: "ChIJ-shared-poi",
        lat: 14.55,
        lng: 121.02,
        formatted_address: "Other street far away",
      },
    );
    expect(same).toBe(false);
  });

  it("treats nearby coordinates as same delivery address", () => {
    const same = isSameDeliveryAddressForList(
      {
        source: "saved_address",
        userId: "u1",
        addressId: "a1",
        placeId: "ChIJ-a",
        lat: 14.586,
        lng: 121.061,
        addressIdentity: null,
        cacheKeyPart: "x",
      },
      {
        place_id: "ChIJ-b",
        lat: 14.5861,
        lng: 121.0611,
      },
    );
    expect(same).toBe(true);
  });
});
