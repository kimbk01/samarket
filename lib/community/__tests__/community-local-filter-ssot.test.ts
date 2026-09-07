import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  buildExplicitCommunityLocalFilter,
  communityLocalFilterStorageKey,
  formatCommunityLocalFilterLabel,
  resolveCommunityLocalFilterAgainstMaster,
  seedCommunityLocalFilterFromMaster,
} from "@/lib/community/community-local-filter-ssot";

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
    cityMunicipality: partial.cityMunicipality ?? "Makati",
    barangay: partial.barangay ?? null,
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
    appRegionId: partial.appRegionId ?? "manila",
    appCityId: partial.appCityId ?? "m2",
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

describe("community local filter SSOT (CUT 2)", () => {
  it("seeds from master taxonomy City — not profiles", () => {
    const seeded = seedCommunityLocalFilterFromMaster(
      addr({ id: "m1", appRegionId: "manila", appCityId: "m2", cityMunicipality: "Makati" }),
    );
    expect(seeded).toMatchObject({
      source: "seed",
      regionId: "manila",
      cityId: "m2",
      masterAddressId: "m1",
      barangay: "",
    });
    expect(formatCommunityLocalFilterLabel(seeded)).toMatch(/Makati/i);
  });

  it("explicit filter is preserved when master changes (CASE D)", () => {
    const explicit = buildExplicitCommunityLocalFilter("manila", "m18");
    expect(explicit?.source).toBe("explicit");
    const next = resolveCommunityLocalFilterAgainstMaster(
      explicit,
      addr({ id: "m2", appRegionId: "manila", appCityId: "m20", cityMunicipality: "Pasig" }),
    );
    expect(next).toEqual(explicit);
  });

  it("seed-only filter reseeds when master changes", () => {
    const seeded = seedCommunityLocalFilterFromMaster(
      addr({ id: "m1", appRegionId: "manila", appCityId: "m2" }),
    );
    const next = resolveCommunityLocalFilterAgainstMaster(
      seeded,
      addr({ id: "m9", appRegionId: "manila", appCityId: "m20", cityMunicipality: "Pasig" }),
    );
    expect(next).toMatchObject({
      source: "seed",
      cityId: "m20",
      masterAddressId: "m9",
    });
  });

  it("storage key is user-scoped", () => {
    expect(communityLocalFilterStorageKey("user-a")).toContain("user-a");
    expect(communityLocalFilterStorageKey("user-a")).not.toBe(
      communityLocalFilterStorageKey("user-b"),
    );
  });

  it("CommunityFeed no longer uses RegionContext for Local authority", () => {
    const feed = readFileSync(join(process.cwd(), "components/community/CommunityFeed.tsx"), "utf8");
    expect(feed).toContain("useCommunityLocalFilter");
    expect(feed).not.toContain("useRegionOptional");
    expect(feed).not.toContain("neighborhoodLocationKeyFromRegion");
  });

  it("filter picker / SSOT never writes user_addresses", () => {
    const ssot = readFileSync(
      join(process.cwd(), "lib/community/community-local-filter-ssot.ts"),
      "utf8",
    );
    const hook = readFileSync(join(process.cwd(), "hooks/use-community-local-filter.ts"), "utf8");
    expect(ssot).not.toContain("createUserAddress");
    expect(ssot).not.toContain("updateUserAddress");
    expect(ssot).not.toContain("isDefaultMaster");
    expect(hook).not.toContain("/api/me/addresses");
    expect(hook).toContain("fetchAddressDefaultsSnapshot");
  });

  it("CUT 1 City-only writer still uses formatPublicAddress", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/addresses/community-public-region-label.ts"),
      "utf8",
    );
    expect(writer).toContain("formatPublicAddress");
    expect(writer).not.toContain("resolveUserAddressTitle");
  });
});
