import { describe, expect, it, vi } from "vitest";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import {
  MASTER_ADDRESS_REGION_ID,
  PROFILE_LOCATION_REGION_ID,
  userRegionFromAddressDefaultsSnapshot,
  userRegionFromMasterAddress,
} from "@/lib/regions/master-address-to-user-region";
import { userRegionFromProfileSlice } from "@/lib/regions/profile-to-user-region";

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => ({ id: "u1" }),
}));

function master(partial: Partial<UserAddressDTO> = {}): UserAddressDTO {
  return {
    id: "addr-1",
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: "Makati",
    barangay: "Poblacion",
    district: null,
    streetAddress: "123 Private St",
    buildingName: "Tower A",
    unitFloorRoom: "Unit 4B",
    landmark: null,
    latitude: null,
    longitude: null,
    placeId: null,
    formattedAddress: null,
    roadAddress: null,
    detailAddress: "Unit 4B, Tower A",
    deliveryNote: null,
    fullAddress: "Unit 4B Tower A, 123 Private St, Poblacion, Makati",
    neighborhoodName: null,
    appRegionId: "manila",
    appCityId: "m2",
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

function snapshot(partial: Partial<AddressDefaultsSnapshot>): AddressDefaultsSnapshot {
  return { ok: true, status: 200, defaults: null, neighborhoodFromLife: null, ...partial };
}

describe("master address → UserRegion (ADDR-SSOT-002)", () => {
  it("derives City-level region; barangay is always empty", () => {
    const r = userRegionFromMasterAddress(master(), "u1");
    expect(r).toMatchObject({
      id: MASTER_ADDRESS_REGION_ID,
      userId: "u1",
      regionId: "manila",
      cityId: "m2",
      barangay: "",
      label: "Manila · Makati",
      isPrimary: true,
    });
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("Poblacion");
    expect(serialized).not.toContain("Unit 4B");
    expect(serialized).not.toContain("Private St");
  });

  it("returns null when master missing", () => {
    expect(userRegionFromMasterAddress(null, "u1")).toBeNull();
  });

  it("snapshot: ok + master → resolved region; ok + no master → resolved null", () => {
    const withMaster = userRegionFromAddressDefaultsSnapshot(
      snapshot({ defaults: { master: master({ appRegionId: "manila", appCityId: "m20" }) } }),
      "u1"
    );
    expect(withMaster.kind).toBe("resolved");
    expect(withMaster.kind === "resolved" && withMaster.region).toMatchObject({
      cityId: "m20",
      barangay: "",
    });

    const noMaster = userRegionFromAddressDefaultsSnapshot(snapshot({ defaults: { master: null } }), "u1");
    expect(noMaster).toEqual({ kind: "resolved", region: null });
  });

  it("snapshot fetch failure → unavailable (caller keeps previous value)", () => {
    expect(userRegionFromAddressDefaultsSnapshot(null, "u1")).toEqual({ kind: "unavailable" });
    expect(userRegionFromAddressDefaultsSnapshot(snapshot({ ok: false, status: 500 }), "u1")).toEqual({
      kind: "unavailable",
    });
  });
});

describe("profile fallback → UserRegion (City only)", () => {
  it("never uses address_detail as barangay or label", () => {
    const slice = {
      region_code: "manila|m2",
      region_name: "Manila · Makati",
      address_detail: "Unit 4B, Tower A",
      full_address: "Unit 4B Tower A, 123 Private St, Makati",
    };
    const r = userRegionFromProfileSlice(slice);
    expect(r).toMatchObject({
      id: PROFILE_LOCATION_REGION_ID,
      regionId: "manila",
      cityId: "m2",
      barangay: "",
      label: "Manila · Makati",
    });
    expect(JSON.stringify(r)).not.toContain("Unit 4B");
  });

  it("matches master derivation for the same City (prewarm key parity)", () => {
    const fromProfile = userRegionFromProfileSlice({ region_code: "manila|m2", region_name: "" });
    const fromMaster = userRegionFromMasterAddress(master(), "u1");
    expect(fromProfile && { r: fromProfile.regionId, c: fromProfile.cityId, b: fromProfile.barangay, l: fromProfile.label }).toEqual(
      fromMaster && { r: fromMaster.regionId, c: fromMaster.cityId, b: fromMaster.barangay, l: fromMaster.label }
    );
  });
});
