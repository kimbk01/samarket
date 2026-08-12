import { describe, expect, it } from "vitest";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import { formatPublicAddress, formatDeliveryAddress } from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

function addr(partial: Partial<UserAddressDTO>): UserAddressDTO {
  return {
    id: "a1",
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: "Home",
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: partial.province ?? "Metro Manila",
    cityMunicipality: partial.cityMunicipality ?? "Pasay",
    barangay: partial.barangay ?? "Barangay 76",
    district: null,
    streetAddress: partial.streetAddress ?? null,
    buildingName: partial.buildingName ?? "SM Mall of Asia",
    unitFloorRoom: partial.unitFloorRoom ?? "Unit 1203",
    landmark: partial.landmark ?? null,
    latitude: 14.53,
    longitude: 120.98,
    placeId: "ChIJtest",
    formattedAddress: partial.formattedAddress ?? "SM Mall of Asia, Pasay, Metro Manila, Philippines",
    roadAddress: null,
    detailAddress: partial.detailAddress ?? "Unit 1203",
    deliveryNote: null,
    fullAddress: partial.fullAddress ?? null,
    neighborhoodName: null,
    appRegionId: partial.appRegionId ?? null,
    appCityId: partial.appCityId ?? null,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: true,
    isDefaultTrade: true,
    isDefaultDelivery: true,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("mapUserAddressToAppLocation ONE taxonomy mapper", () => {
  it("maps Pasay MOA Google-style address without stored app ids", () => {
    const hit = mapUserAddressToAppLocation(addr({ appRegionId: null, appCityId: null }));
    expect(hit).not.toBeNull();
    expect(hit!.regionId).toBe("manila");
    expect(["m36", "m37"]).toContain(hit!.cityId);
  });

  it("prefers valid stored app ids", () => {
    const hit = mapUserAddressToAppLocation(addr({ appRegionId: "quezon", appCityId: "q1" }));
    expect(hit).toEqual({ regionId: "quezon", cityId: "q1" });
  });

  it("inferAppLocationIdsFromUserAddress aliases the same mapper", () => {
    const a = addr({ appRegionId: null, appCityId: null });
    expect(inferAppLocationIdsFromUserAddress(a)).toEqual(mapUserAddressToAppLocation(a));
  });
});

describe("PUBLIC vs DELIVERY formatter", () => {
  it("public omits unit/detail; delivery keeps them", () => {
    const a = addr({});
    const pub = formatPublicAddress(a) ?? "";
    const del = formatDeliveryAddress(a);
    expect(pub.toLowerCase()).not.toMatch(/unit\s*1203/);
    expect(del.toLowerCase()).toMatch(/unit/);
  });
});
