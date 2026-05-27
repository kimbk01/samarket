import { describe, expect, it } from "vitest";
import {
  resolveDeliveryHomeHeaderStateFromSnapshot,
  resolveExplorationAddressLineFromSnapshot,
  resolveRepresentativeFullAddressLineFromSnapshot,
  shouldRetryAddressDefaultsSnapshotFetch,
} from "@/lib/addresses/address-defaults-snapshot-resolvers";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
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
    cityMunicipality: partial.cityMunicipality ?? "Quezon City",
    barangay: partial.barangay ?? "Diliman",
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
    appRegionId: partial.appRegionId ?? "ncr",
    appCityId: partial.appCityId ?? "quezon",
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
  };
}

function snapshot(partial: Partial<AddressDefaultsSnapshot>): AddressDefaultsSnapshot {
  return {
    ok: partial.ok ?? true,
    status: partial.status ?? 200,
    defaults: partial.defaults ?? null,
    neighborhoodFromLife: partial.neighborhoodFromLife ?? null,
  };
}

describe("address-defaults-snapshot-resolvers", () => {
  it("uses neighborhoodFromLife when exploration master line is empty", () => {
    const line = resolveExplorationAddressLineFromSnapshot(
      snapshot({
        defaults: {
          master: addr({
            id: "m1",
            appRegionId: null,
            appCityId: null,
            barangay: "",
            cityMunicipality: "",
            province: "",
            fullAddress: null,
            formattedAddress: null,
          }),
        },
        neighborhoodFromLife: { complete: false, label: "Quezon City · Diliman" },
      })
    );
    expect(line).toBe("Quezon City · Diliman");
  });

  it("picks delivery row for stores header and falls back to life neighborhood", () => {
    const state = resolveDeliveryHomeHeaderStateFromSnapshot(
      snapshot({
        defaults: {
          delivery: addr({
            id: "d1",
            neighborhoodName: "Malate",
            buildingName: "12B",
          }),
        },
      })
    );
    expect(state).toEqual({
      status: "ready",
      line: expect.stringContaining("Malate"),
      hasLinkedAddress: true,
    });
  });

  it("falls back to trade row for full address when master missing", () => {
    const line = resolveRepresentativeFullAddressLineFromSnapshot(
      snapshot({
        defaults: {
          trade: addr({
            id: "t1",
            detailAddress: "Unit 5",
            formattedAddress: "123 Sample St, Quezon City, Metro Manila, Philippines",
          }),
        },
      })
    );
    expect(line).toBeTruthy();
    expect(line).toContain("Unit 5");
  });

  it("flags auth failures for boot retry", () => {
    expect(shouldRetryAddressDefaultsSnapshotFetch(snapshot({ ok: false, status: 401 }))).toBe(true);
    expect(shouldRetryAddressDefaultsSnapshotFetch(snapshot({ ok: true, status: 200, defaults: {} }))).toBe(false);
  });
});
