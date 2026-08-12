import { describe, expect, it } from "vitest";
import {
  formatAddressBookLine,
  formatAddressBookLineSegments,
} from "@/lib/addresses/address-book-line";
import { formatAddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import { formatDeliveryAddress, formatPublicAddress } from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

function addr(partial: Partial<UserAddressDTO> = {}): UserAddressDTO {
  return {
    id: "m1",
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: "집",
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: "Pasig City",
    barangay: "San Antonio",
    district: null,
    streetAddress: "123 Maharlika Street",
    buildingName: "Greenview Subdivision",
    unitFloorRoom: "Unit 4B",
    landmark: null,
    latitude: 14.58,
    longitude: 121.08,
    placeId: "ChIJtest",
    formattedAddress:
      "Unit 4B, 123 Maharlika Street, Greenview Subdivision, Barangay San Antonio, Pasig City, 1605 Metro Manila, Philippines",
    roadAddress: null,
    detailAddress: "Unit 4B",
    deliveryNote: null,
    fullAddress: null,
    neighborhoodName: null,
    appRegionId: "manila",
    appCityId: "m20",
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
    ...partial,
  };
}

describe("formatAddressBookLine — compact continuous / no country / detail first", () => {
  it("Pasig fixture matches expected compact continuous string", () => {
    const plain = formatAddressBookLine(addr());
    expect(plain).toBe(
      "Unit 4B, 123 Maharlika Street, Greenview Subdivision, Barangay San Antonio, Pasig City, Metro Manila",
    );
    expect(plain).not.toMatch(/PHILIPPINES|Philippines|필리핀/i);
    expect(plain).not.toMatch(/,\s*,/);
    expect(plain).not.toMatch(/\n/);
  });

  it("segments expose detail for bold UI", () => {
    const seg = formatAddressBookLineSegments(addr());
    expect(seg?.detail).toBe("Unit 4B");
    expect(seg?.rest).toBe(
      "123 Maharlika Street, Greenview Subdivision, Barangay San Antonio, Pasig City, Metro Manila",
    );
    const card = formatAddressBookCardPresentation(addr());
    expect(card?.gatePrefix).toBe("Unit 4B");
    expect(card?.streetBody).toBe(seg?.rest);
  });

  it("omits empty tokens; works without detail", () => {
    const plain = formatAddressBookLine(
      addr({ unitFloorRoom: null, detailAddress: null, buildingName: null }),
    );
    expect(plain).toBe("123 Maharlika Street, Barangay San Antonio, Pasig City, Metro Manila");
    expect(formatAddressBookLineSegments(addr({ unitFloorRoom: null, detailAddress: null }))?.detail).toBeNull();
  });

  it("PUBLIC and DELIVERY stay separate contracts", () => {
    const row = addr();
    expect(formatPublicAddress(row)).toBe("Pasig City");
    expect(formatDeliveryAddress(row).split("\n")[0]).toBe("Unit 4B");
    expect(formatDeliveryAddress(row)).toMatch(/PHILIPPINES/);
    expect(formatAddressBookLine(row)).not.toMatch(/PHILIPPINES/i);
  });
});
