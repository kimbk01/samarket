import { describe, expect, it } from "vitest";
import {
  buildPublicAllowListAddressLine,
  resolvePublicCityMunicipalityLabel,
} from "@/lib/addresses/public-address-allow-list";
import {
  buildExplorationRegionSubtitleLine,
  buildTradePublicLine,
  formatDeliveryAddress,
  formatPublicAddress,
} from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

function addr(partial: Partial<UserAddressDTO> & { id?: string }): UserAddressDTO {
  return {
    id: partial.id ?? "m1",
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: "Home",
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: partial.province ?? "Metro Manila",
    cityMunicipality: partial.cityMunicipality ?? "Pasig City",
    barangay: partial.barangay ?? "San Antonio",
    district: null,
    streetAddress: partial.streetAddress ?? "123 Maharlika Street",
    buildingName: partial.buildingName ?? "Greenview Subdivision",
    unitFloorRoom: partial.unitFloorRoom ?? "Unit 4B",
    landmark: partial.landmark ?? null,
    latitude: 14.58,
    longitude: 121.08,
    placeId: "ChIJtest",
    formattedAddress:
      partial.formattedAddress ??
      "Unit 4B, 123 Maharlika Street, Greenview Subdivision, Barangay San Antonio, Pasig City, 1605 Metro Manila, Philippines",
    roadAddress: partial.roadAddress ?? null,
    detailAddress: partial.detailAddress ?? "Unit 4B",
    deliveryNote: null,
    fullAddress: partial.fullAddress ?? null,
    neighborhoodName: partial.neighborhoodName ?? null,
    appRegionId: partial.appRegionId ?? "manila",
    appCityId: partial.appCityId ?? "m20",
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

describe("PH public = City/Municipality only", () => {
  it("Pasig fixture: PUBLIC is Pasig City only", () => {
    const row = addr({});
    expect(formatPublicAddress(row)).toBe("Pasig City");
    expect(resolvePublicCityMunicipalityLabel(row)).toBe("Pasig City");
    expect(buildPublicAllowListAddressLine(row)).toBe("Pasig City");
    expect(buildExplorationRegionSubtitleLine(row)).toBe("Pasig City");
    expect(buildTradePublicLine(row)).toBe("Pasig City");
  });

  it("PUBLIC never leaks unit/street/barangay/building/province", () => {
    const row = addr({});
    const line = formatPublicAddress(row) ?? "";
    expect(line).not.toMatch(/Unit|4B|Maharlika|Greenview|San Antonio|1605|Metro Manila|PHILIPPINES/i);
    expect(line).toBe("Pasig City");
  });

  it("rejects Metro Manila / Barangay as city authority", () => {
    expect(
      resolvePublicCityMunicipalityLabel(
        addr({ cityMunicipality: "Metro Manila", appRegionId: null, appCityId: null }),
      ),
    ).toBeNull();
    expect(
      resolvePublicCityMunicipalityLabel(
        addr({ cityMunicipality: "Barangay San Antonio", appRegionId: null, appCityId: null }),
      ),
    ).toBeNull();
  });

  it("taxonomy fallback uses leading catalog city token when cityMunicipality empty", () => {
    const row = addr({
      cityMunicipality: null,
      appRegionId: "manila",
      appCityId: "m36",
    });
    expect(formatPublicAddress(row)).toBe("Pasay");
  });
});

describe("PH delivery full address order", () => {
  it("Pasig fixture: DELIVERY has PH order with unit first", () => {
    const del = formatDeliveryAddress(addr({}));
    const lines = del.split("\n");
    expect(lines[0]).toBe("Unit 4B");
    expect(lines).toContain("123 Maharlika Street");
    expect(lines).toContain("Greenview Subdivision");
    expect(lines.some((l) => /Barangay San Antonio/i.test(l))).toBe(true);
    expect(lines).toContain("Pasig City");
    expect(lines).toContain("Metro Manila");
    expect(lines[lines.length - 1]).toBe("PHILIPPINES");
    expect(del).not.toMatch(/\n\n/);
  });

  it("omits empty fields without blank lines", () => {
    const del = formatDeliveryAddress(
      addr({
        unitFloorRoom: null,
        detailAddress: null,
        landmark: null,
        buildingName: null,
        barangay: null,
      }),
    );
    expect(del.split("\n")[0]).toBe("123 Maharlika Street");
    expect(del).not.toMatch(/\n\n/);
  });

  it("province city + municipality + building variants stay city-only on PUBLIC", () => {
    expect(
      formatPublicAddress(
        addr({
          cityMunicipality: "Cebu City",
          province: "Cebu",
          barangay: "Lahug",
          buildingName: "Ayala Center Cebu",
          appRegionId: null,
          appCityId: null,
        }),
      ),
    ).toBe("Cebu City");
    expect(
      formatPublicAddress(
        addr({
          cityMunicipality: "Cainta",
          province: "Rizal",
          barangay: "San Juan",
          unitFloorRoom: null,
          detailAddress: null,
          buildingName: null,
          appRegionId: null,
          appCityId: null,
        }),
      ),
    ).toBe("Cainta");
    expect(
      formatPublicAddress(
        addr({
          cityMunicipality: "Davao City",
          province: "Davao del Sur",
          barangay: "Poblacion",
          buildingName: "SM Lanang Premier",
          appRegionId: null,
          appCityId: null,
        }),
      ),
    ).toBe("Davao City");
  });
});
