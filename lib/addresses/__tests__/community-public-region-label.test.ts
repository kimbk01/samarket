import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMUNITY_PUBLIC_REGION_FALLBACK,
  publicRegionLabelLeaksPrivateDetail,
  sanitizePublicRegionLabel,
} from "@/lib/addresses/community-public-region-label";
import { resolveUserAddressTitle } from "@/lib/addresses/user-address-display-ssot";
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
    cityMunicipality: "Quezon City",
    barangay: "Diliman",
    district: null,
    streetAddress: null,
    buildingName: "Commonwealth Tower",
    unitFloorRoom: partial.unitFloorRoom ?? null,
    landmark: null,
    latitude: null,
    longitude: null,
    placeId: null,
    formattedAddress: "Commonwealth Avenue, Quezon City",
    roadAddress: null,
    detailAddress: partial.detailAddress ?? null,
    deliveryNote: null,
    fullAddress: null,
    neighborhoodName: "Diliman",
    appRegionId: "ncr",
    appCityId: "quezon",
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

describe("community public region writer", () => {
  it("rejects unit/room/floor/동호 injection", () => {
    expect(publicRegionLabelLeaksPrivateDetail("101동 1203호")).toBe(true);
    expect(publicRegionLabelLeaksPrivateDetail("Unit 1203")).toBe(true);
    expect(publicRegionLabelLeaksPrivateDetail("Room 4")).toBe(true);
    expect(publicRegionLabelLeaksPrivateDetail("8th Floor")).toBe(true);
    expect(sanitizePublicRegionLabel("Unit 8, Malate")).toBeNull();
    expect(sanitizePublicRegionLabel("Malate")).toBe("Malate");
    expect(COMMUNITY_PUBLIC_REGION_FALLBACK).toBe("동네");
  });

  it("master TITLE does not include detail", () => {
    const line = resolveUserAddressTitle(
      addr({ id: "m1", detailAddress: "Unit 1203 / Room 4", unitFloorRoom: "Unit 1203" }),
    );
    expect(line ?? "").not.toMatch(/Unit 1203|Room 4/i);
    expect(line).toBe("Commonwealth Tower");
    expect(sanitizePublicRegionLabel(line)).toBeTruthy();
  });

  it("community POST writers ignore client region_label and use server resolver", () => {
    const posts = readFileSync(join(process.cwd(), "app/api/community/posts/route.ts"), "utf8");
    const hood = readFileSync(join(process.cwd(), "app/api/community/neighborhood-posts/route.ts"), "utf8");
    expect(posts).toContain("resolveCommunityPublicRegionLabelForUser");
    expect(posts).not.toMatch(/body\.region_label/);
    expect(posts).not.toMatch(/"Malate"/);
    expect(hood).toContain("resolveCommunityPublicRegionLabelForUser");
    expect(hood).not.toMatch(/region_label: locationName/);
  });

  it("trade/service POST rejects private-detail region injection", () => {
    const create = readFileSync(join(process.cwd(), "app/api/posts/create/route.ts"), "utf8");
    expect(create).toContain("publicRegionLabelLeaksPrivateDetail");
    expect(create).toContain("region_label_invalid");
  });
});
