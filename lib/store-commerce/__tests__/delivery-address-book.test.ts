import { describe, expect, it } from "vitest";
import {
  canAcceptCartDeliverySelectionId,
  isCartDeliverySelectionValid,
  resolveCartDefaultDeliverySelectionId,
  userAddressDeliverySelectionId,
} from "@/lib/store-commerce/delivery-address-book";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

function addr(partial: Partial<UserAddressDTO> & { id: string }): UserAddressDTO {
  return {
    id: partial.id,
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: "Manila",
    barangay: "Malate",
    district: null,
    streetAddress: null,
    buildingName: null,
    unitFloorRoom: null,
    landmark: null,
    latitude: null,
    longitude: null,
    placeId: null,
    formattedAddress: null,
    roadAddress: null,
    detailAddress: null,
    deliveryNote: null,
    fullAddress: null,
    neighborhoodName: null,
    appRegionId: null,
    appCityId: null,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: partial.isDefaultMaster ?? false,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: partial.isDefaultDelivery ?? false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("resolveCartDefaultDeliverySelectionId", () => {
  it("uses master even when a different legacy delivery default exists", () => {
    const master = addr({ id: "m1", isDefaultMaster: true });
    const delivery = addr({ id: "d1", isDefaultDelivery: true });
    expect(resolveCartDefaultDeliverySelectionId([master, delivery], null)).toBe(
      userAddressDeliverySelectionId("m1"),
    );
    expect(resolveCartDefaultDeliverySelectionId([master], { userAddressId: "m1" })).toBe(
      "__kasama_profile_delivery__",
    );
    expect(resolveCartDefaultDeliverySelectionId([], { userAddressId: "m1" })).toBeNull();
  });

  it("rejects non-master user address selections", () => {
    const master = addr({ id: "m1", isDefaultMaster: true });
    const nonMaster = addr({ id: "d1", isDefaultDelivery: true });
    expect(isCartDeliverySelectionValid(userAddressDeliverySelectionId("m1"), [master, nonMaster], null)).toBe(true);
    expect(isCartDeliverySelectionValid(userAddressDeliverySelectionId("d1"), [master, nonMaster], null)).toBe(false);
  });

  it("canAcceptCartDeliverySelectionId mirrors master-only rule", () => {
    const master = addr({ id: "m1", isDefaultMaster: true });
    const nonMaster = addr({ id: "d1" });
    expect(
      canAcceptCartDeliverySelectionId(userAddressDeliverySelectionId("m1"), [master, nonMaster], null),
    ).toBe(true);
    expect(
      canAcceptCartDeliverySelectionId(userAddressDeliverySelectionId("d1"), [master, nonMaster], null),
    ).toBe(false);
  });
});
