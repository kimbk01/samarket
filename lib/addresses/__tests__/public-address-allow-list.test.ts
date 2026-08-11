import { describe, expect, it } from "vitest";
import { buildPublicAllowListAddressLine } from "@/lib/addresses/public-address-allow-list";
import { buildExplorationRegionSubtitleLine, buildTradePublicLine } from "@/lib/addresses/user-address-format";
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
    barangay: partial.barangay ?? "Malate",
    district: null,
    streetAddress: partial.streetAddress ?? null,
    buildingName: partial.buildingName ?? "Robinsons Manila",
    unitFloorRoom: partial.unitFloorRoom ?? "Unit 1203",
    landmark: partial.landmark ?? null,
    latitude: null,
    longitude: null,
    placeId: null,
    formattedAddress:
      partial.formattedAddress ?? "Unit 1203, Robinsons Manila, Malate, Manila, Philippines",
    roadAddress: partial.roadAddress ?? "Unit 1203, Robinsons Manila, Malate, Manila",
    detailAddress: partial.detailAddress ?? "Unit 1203 / Room 4",
    deliveryNote: null,
    fullAddress: partial.fullAddress ?? "Unit 1203, Robinsons Manila, Malate, Manila, Philippines",
    neighborhoodName: partial.neighborhoodName ?? "Malate",
    appRegionId: "ncr",
    appCityId: "manila",
    useForLife: true,
    useForTrade: true,
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

describe("public address allow-list", () => {
  it("composes barangay/city + building and drops unit/detail/formatted dump", () => {
    const row = addr({ id: "m1" });
    const line = buildPublicAllowListAddressLine(row) ?? "";
    expect(line).toContain("Malate");
    expect(line).toContain("Manila");
    expect(line).toContain("Robinsons Manila");
    expect(line).not.toMatch(/Unit 1203|Room 4/i);
    expect(line).not.toBe(row.formattedAddress);
  });

  it("community and trade formatters share the allow-list (no unit leak)", () => {
    const row = addr({ id: "m1", unitFloorRoom: "8th Floor", detailAddress: "House No. 15 interior" });
    const community = buildExplorationRegionSubtitleLine(row) ?? "";
    const trade = buildTradePublicLine(row);
    expect(community).not.toMatch(/Unit|Room|Floor|House No\.|8th Floor/i);
    expect(trade).not.toMatch(/Unit|Room|Floor|House No\.|8th Floor/i);
    expect(community).not.toContain("formatted");
  });
});
