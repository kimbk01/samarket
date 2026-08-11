import { describe, expect, it } from "vitest";
import {
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
  it("uses isDefaultDelivery only and does not fall back to master", () => {
    const master = addr({ id: "m1", isDefaultMaster: true });
    const delivery = addr({ id: "d1", isDefaultDelivery: true });
    expect(resolveCartDefaultDeliverySelectionId([master, delivery], null)).toBe(
      userAddressDeliverySelectionId("d1"),
    );
    expect(resolveCartDefaultDeliverySelectionId([master], { userAddressId: "m1" })).toBeNull();
    expect(resolveCartDefaultDeliverySelectionId([], { userAddressId: "m1" })).toBeNull();
  });
});
