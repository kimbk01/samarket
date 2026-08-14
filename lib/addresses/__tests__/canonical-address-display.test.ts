import { describe, expect, it } from "vitest";
import {
  resolveAddressBookAddressLine,
  resolveAddressBookDetailLine,
  resolveAddressBookTitle,
  resolveCanonicalChipLine,
  formatCanonicalFullLine,
  realPlaceNameFromStoredBuilding,
  displayInputFromDto,
} from "@/lib/addresses/canonical-address-display";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

const labels = { home: "집", office: "회사", shop: "매장" };

function dto(partial: Partial<UserAddressDTO>): UserAddressDTO {
  return {
    id: "a1",
    userId: "u1",
    labelType: "other",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: "Pasay City",
    barangay: null,
    district: null,
    streetAddress: "Seaside Boulevard",
    buildingName: null,
    unitFloorRoom: null,
    landmark: null,
    latitude: 14.53,
    longitude: 120.98,
    placeId: "pid",
    formattedAddress: "Seaside Boulevard, Pasay City",
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
    isDefaultMaster: false,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("canonical address display SSOT", () => {
  it("PLACE present → place title + address, no title repeat", () => {
    const input = {
      placeName: "SM Mall of Asia",
      streetAddress: "Seaside Boulevard",
      cityMunicipality: "Pasay City",
      province: "Metro Manila",
    };
    expect(resolveAddressBookTitle(input)).toBe("SM Mall of Asia");
    expect(resolveAddressBookAddressLine(input)).toBe("Seaside Boulevard, Pasay City, Metro Manila");
  });

  it("NO PLACE → street is title, barangay/city is address", () => {
    const input = {
      streetAddress: "123 Sampaguita Street",
      barangay: "San Antonio",
      cityMunicipality: "Pasig City",
    };
    expect(resolveAddressBookTitle(input)).toBe("123 Sampaguita Street");
    expect(resolveAddressBookAddressLine(input)).toBe("Barangay San Antonio, Pasig City");
  });

  it("place wins over custom nickname; address line keeps the street", () => {
    const input = {
      userLabel: "우리집",
      placeName: "SM Mall of Asia",
      streetAddress: "123 Sampaguita Street",
      cityMunicipality: "Pasig City",
    };
    expect(resolveAddressBookTitle(input)).toBe("SM Mall of Asia");
    expect(resolveAddressBookAddressLine(input)).toContain("123 Sampaguita Street");
    expect(resolveAddressBookAddressLine(input)).not.toContain("우리집");
  });

  it("NO PLACE → neighborhood is title before street", () => {
    const input = {
      neighborhoodName: "Malate",
      streetAddress: "Mabini Street",
      cityMunicipality: "Manila",
    };
    expect(resolveAddressBookTitle(input)).toBe("Malate");
    expect(resolveAddressBookAddressLine(input)).toBe("Mabini Street, Manila");
  });

  it("null buildingName does not blank title when street exists", () => {
    expect(resolveAddressBookTitle({ placeName: null, streetAddress: "Sampaguita Street" })).toBe(
      "Sampaguita Street",
    );
  });

  it("does not treat street stored as buildingName as a place", () => {
    expect(realPlaceNameFromStoredBuilding("123 Sampaguita Street", "123 Sampaguita Street")).toBeNull();
  });

  it("detail line keeps user detail + landmark and excludes deliveryNote", () => {
    expect(
      resolveAddressBookDetailLine({
        detail: "House 17",
        landmark: "Green gate",
        deliveryNote: "Call on arrival",
      }),
    ).toBe("House 17, Green gate");
  });

  it("home label from dto is not the FULL title — place is", () => {
    const input = displayInputFromDto(dto({ labelType: "home", buildingName: "SM Mall of Asia" }), labels);
    expect(resolveAddressBookTitle(input)).toBe("SM Mall of Asia");
    expect(input.neighborhoodName).toBeNull();
  });

  it("SHORT chip is place, else neighborhood, never city-only", () => {
    expect(
      resolveCanonicalChipLine({
        placeName: "SM Mall of Asia",
        neighborhoodName: "Malate",
        cityMunicipality: "Pasay City",
      }),
    ).toBe("SM Mall of Asia");
    expect(
      resolveCanonicalChipLine({
        neighborhoodName: "Malate",
        cityMunicipality: "Manila",
        streetAddress: "Mabini Street",
      }),
    ).toBe("Malate");
    expect(
      resolveCanonicalChipLine({
        cityMunicipality: "Manila",
        streetAddress: "Mabini Street",
      }),
    ).toBe("");
  });

  it("FULL line uses PH order: detail first, then title and road/area without deliveryNote", () => {
    const line = formatCanonicalFullLine({
      placeName: "SM Mall of Asia",
      streetAddress: "Seaside Boulevard",
      cityMunicipality: "Pasay City",
      detail: "Unit 12B",
      landmark: "Green gate",
      deliveryNote: "Call on arrival",
    });
    expect(line).toBe("Unit 12B, Green gate, SM Mall of Asia, Seaside Boulevard, Pasay City");
    expect(line).not.toContain("Call on arrival");
  });

  it("internal nickname + other keeps Google place as title", () => {
    const input = displayInputFromDto(
      dto({
        labelType: "other",
        nickname: "__sam_tmp:abc",
        buildingName: "SM Mall of Asia",
      }),
      labels,
    );
    expect(resolveAddressBookTitle(input)).toBe("SM Mall of Asia");
  });
});
