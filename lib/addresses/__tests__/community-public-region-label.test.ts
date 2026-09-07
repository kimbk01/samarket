import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMUNITY_PUBLIC_REGION_FALLBACK,
  formatCommunityPublicRegionLabel,
  publicRegionLabelLeaksPrivateDetail,
  sanitizePublicRegionLabel,
} from "@/lib/addresses/community-public-region-label";
import { formatPublicAddress } from "@/lib/addresses/user-address-format";
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
    cityMunicipality: partial.cityMunicipality ?? "Quezon City",
    barangay: "Diliman",
    district: null,
    streetAddress: partial.streetAddress ?? null,
    buildingName: partial.buildingName ?? null,
    unitFloorRoom: partial.unitFloorRoom ?? null,
    landmark: null,
    latitude: null,
    longitude: null,
    placeId: null,
    formattedAddress: partial.formattedAddress ?? "Commonwealth Avenue, Quezon City",
    roadAddress: null,
    detailAddress: partial.detailAddress ?? null,
    deliveryNote: null,
    fullAddress: null,
    neighborhoodName: "Diliman",
    appRegionId: "ncr",
    appCityId: partial.appCityId ?? "quezon",
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

describe("community public region CITY-ONLY (CUT 1)", () => {
  it("rejects unit/room/floor/동호 injection", () => {
    expect(publicRegionLabelLeaksPrivateDetail("101동 1203호")).toBe(true);
    expect(publicRegionLabelLeaksPrivateDetail("Unit 1203")).toBe(true);
    expect(sanitizePublicRegionLabel("Unit 8, Malate")).toBeNull();
    expect(sanitizePublicRegionLabel("Malate")).toBe("Malate");
    expect(COMMUNITY_PUBLIC_REGION_FALLBACK).toBe("동네");
  });

  it("writer source is formatPublicAddress City — not TITLE/building", () => {
    const row = addr({
      id: "m1",
      buildingName: "Commonwealth Tower",
      detailAddress: "Unit 1203",
      unitFloorRoom: "Unit 1203",
    });
    expect(formatPublicAddress(row)).toBe("Quezon City");
    expect(sanitizePublicRegionLabel(formatPublicAddress(row))).toBe("Quezon City");
  });

  it("reader fail-closes TITLE-like stored labels without comma City invention", () => {
    expect(formatCommunityPublicRegionLabel({ regionLabel: "Commonwealth Tower" })).toBe(
      COMMUNITY_PUBLIC_REGION_FALLBACK,
    );
    expect(formatCommunityPublicRegionLabel({ regionLabel: "123 Ayala Avenue" })).toBe(
      COMMUNITY_PUBLIC_REGION_FALLBACK,
    );
    expect(
      formatCommunityPublicRegionLabel({
        regionLabel: "123 Ayala Avenue, Makati",
      }),
    ).toBe(COMMUNITY_PUBLIC_REGION_FALLBACK);
    expect(formatCommunityPublicRegionLabel({ regionLabel: "Makati" })).toBe("Makati");
    expect(
      formatCommunityPublicRegionLabel({
        regionLabel: "Commonwealth Tower",
        locationCity: "Quezon City",
      }),
    ).toBe("Quezon City");
  });

  it("community POST writers ignore client region_label and use server resolver", () => {
    const posts = readFileSync(join(process.cwd(), "app/api/community/posts/route.ts"), "utf8");
    const hood = readFileSync(join(process.cwd(), "app/api/community/neighborhood-posts/route.ts"), "utf8");
    const writer = readFileSync(
      join(process.cwd(), "lib/addresses/community-public-region-label.ts"),
      "utf8",
    );
    expect(posts).toContain("resolveCommunityPublicRegionLabelForUser");
    expect(posts).not.toMatch(/body\.region_label/);
    expect(hood).toContain("resolveCommunityPublicRegionLabelForUser");
    expect(hood).not.toMatch(/region_label: locationName/);
    expect(writer).toContain("formatPublicAddress");
    expect(writer).not.toContain("resolveUserAddressTitle");
  });

  it("trade/service POST rejects private-detail region injection", () => {
    const create = readFileSync(join(process.cwd(), "app/api/posts/create/route.ts"), "utf8");
    expect(create).toContain("publicRegionLabelLeaksPrivateDetail");
    expect(create).toContain("region_label_invalid");
  });

  it("exploration header resolver uses PUBLIC City not TITLE", () => {
    const resolvers = readFileSync(
      join(process.cwd(), "lib/addresses/address-defaults-snapshot-resolvers.ts"),
      "utf8",
    );
    expect(resolvers).toContain("formatUserAddressPublic");
    expect(resolvers).not.toMatch(
      /resolveExplorationAddressLineFromSnapshot[\s\S]*formatUserAddressTitle/,
    );
  });
});
