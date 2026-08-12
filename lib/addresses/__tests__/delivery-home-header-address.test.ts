import { describe, expect, it } from "vitest";
import {
  buildDeliveryHomeHeaderAddressLine,
  normalizeDeliveryHomeHeaderDisplayLine,
  pickDeliveryHomeHeaderAddress,
  resolveDeliveryHomeHeaderDisplayLine,
} from "@/lib/addresses/delivery-home-header-address";
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
    province: partial.province ?? "Metro Manila",
    cityMunicipality: partial.cityMunicipality ?? "Manila",
    barangay: partial.barangay ?? null,
    district: partial.district ?? null,
    streetAddress: partial.streetAddress ?? null,
    buildingName: partial.buildingName ?? null,
    unitFloorRoom: partial.unitFloorRoom ?? null,
    landmark: null,
    latitude: null,
    longitude: null,
    placeId: partial.placeId ?? null,
    formattedAddress: partial.formattedAddress ?? null,
    roadAddress: partial.roadAddress ?? null,
    detailAddress: partial.detailAddress ?? null,
    deliveryNote: null,
    fullAddress: partial.fullAddress ?? null,
    neighborhoodName: partial.neighborhoodName ?? null,
    appRegionId: null,
    appCityId: null,
    useForLife: true,
    useForTrade: false,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("buildDeliveryHomeHeaderAddressLine", () => {
  it("prefers neighborhood + user detail (not Google road)", () => {
    const line = buildDeliveryHomeHeaderAddressLine(
      addr({
        id: "a1",
        neighborhoodName: "Malate",
        streetAddress: "2847-2 Mabini St",
        roadAddress: "123 Long Google Formatted Ave, Manila, Philippines",
      })
    );
    expect(line).toBe("Malate 2847-2 Mabini St");
    expect(line).not.toContain("Google");
  });

  it("ignores Google formattedAddress when user detail exists", () => {
    const line = buildDeliveryHomeHeaderAddressLine(
      addr({
        id: "a2",
        barangay: "복대동",
        buildingName: "2847-2",
        formattedAddress: "Some Google Place, Quezon City, Metro Manila, Philippines",
        fullAddress: "Some Google Place, Quezon City, Metro Manila, Philippines",
      })
    );
    expect(line).toBe("복대동 2847-2");
  });

  it("does not fall back to Google-only roadAddress", () => {
    const line = buildDeliveryHomeHeaderAddressLine(
      addr({
        id: "a3",
        roadAddress: "123 Google Road, Manila",
        formattedAddress: "123 Google Road, Manila, Philippines",
      })
    );
    expect(line).toBeNull();
  });

  it("returns null when no address id", () => {
    expect(buildDeliveryHomeHeaderAddressLine(null)).toBeNull();
    expect(buildDeliveryHomeHeaderAddressLine(addr({ id: "" }))).toBeNull();
  });

  it("joins multiple user detail fields", () => {
    const line = buildDeliveryHomeHeaderAddressLine(
      addr({
        id: "a4",
        neighborhoodName: "Malate",
        buildingName: "Green Residences",
        unitFloorRoom: "Unit 12B",
      })
    );
    expect(line).toContain("Malate");
    expect(line).toContain("Green Residences");
    expect(line).toContain("Unit 12B");
  });
});

describe("normalizeDeliveryHomeHeaderDisplayLine", () => {
  it("treats card placeholder em dash as empty", () => {
    expect(normalizeDeliveryHomeHeaderDisplayLine("—")).toBeNull();
    expect(normalizeDeliveryHomeHeaderDisplayLine("Malate 12B")).toBe("Malate 12B");
  });
});
describe("resolveDeliveryHomeHeaderDisplayLine", () => {
  it("uses PH address-book compact string matching address sheet (not barangay-prefixed baemin)", () => {
    const row = addr({
      id: "office1",
      labelType: "office",
      barangay: "Diliman",
      cityMunicipality: "Quezon City",
      detailAddress: "wwwww",
      unitFloorRoom: "3/F Room",
      buildingName: "UP EEEI Smart Systems Laboratory",
      streetAddress: "310 P. Velasquez Street",
      formattedAddress:
        "UP EEEI Smart Systems Laboratory, 3/F Room, 310 P. Velasquez Street, Diliman, Quezon City, Metro Manila, Philippines",
      fullAddress:
        "UP EEEI Smart Systems Laboratory, 3/F Room, 310 P. Velasquez Street, Diliman, Quezon City, Metro Manila, Philippines",
    });
    const line = resolveDeliveryHomeHeaderDisplayLine(row);
    expect(line).not.toMatch(/^Diliman wwwww/);
    expect(line).not.toMatch(/PHILIPPINES|Philippines/i);
    expect(line).toContain("wwwww");
    expect(line).toContain("3/F Room");
    expect(line).toContain("UP EEEI Smart Systems Laboratory");
    expect(line).toContain("310 P. Velasquez Street");
    expect(line).toContain("Quezon City");
  });

  it("uses address-book compact string when only detail + city/province present", () => {
    const line = resolveDeliveryHomeHeaderDisplayLine(
      addr({
        id: "a5",
        detailAddress: "1003 - COD",
      }),
    );
    expect(line).toBe("1003 - COD, Manila, Metro Manila");
    expect(line).not.toMatch(/PHILIPPINES|Philippines/i);
  });
});

describe("pickDeliveryHomeHeaderAddress", () => {
  it("prefers delivery default over master", () => {
    const delivery = addr({ id: "d1", neighborhoodName: "A", buildingName: "1" });
    const master = addr({ id: "m1", neighborhoodName: "B", buildingName: "2" });
    expect(pickDeliveryHomeHeaderAddress({ delivery, master, life: null, trade: null })?.id).toBe("d1");
  });

  it("does not fall back to master/trade/life when delivery is missing", () => {
    const trade = addr({ id: "t1", neighborhoodName: "Trade", buildingName: "1" });
    const life = addr({ id: "l1", neighborhoodName: "Life", buildingName: "2" });
    const master = addr({ id: "m1", neighborhoodName: "Master", buildingName: "2" });
    expect(pickDeliveryHomeHeaderAddress({ delivery: null, master, trade, life })).toBeNull();
    expect(pickDeliveryHomeHeaderAddress({ delivery: null, master: null, trade, life })).toBeNull();
    expect(pickDeliveryHomeHeaderAddress({ delivery: null, master: null, trade: null, life })).toBeNull();
  });
});
