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
  it("does not fall back to neighborhoodFromLife when master TITLE is empty", () => {
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
            buildingName: null,
            neighborhoodName: null,
            fullAddress: null,
            formattedAddress: null,
          }),
        },
        neighborhoodFromLife: { complete: false, label: "Quezon City · Diliman" },
      })
    );
    expect(line).toBeNull();
  });

  it("picks master row for stores header TITLE chip", () => {
    const state = resolveDeliveryHomeHeaderStateFromSnapshot(
      snapshot({
        defaults: {
          master: addr({
            id: "m1",
            neighborhoodName: "Malate",
            buildingName: "12B",
          }),
          delivery: addr({
            id: "d1",
            neighborhoodName: "Ermita",
            buildingName: "Other",
          }),
        },
      })
    );
    expect(state.status).toBe("ready");
    if (state.status !== "ready") throw new Error("expected ready");
    expect(state.hasLinkedAddress).toBe(true);
    expect(state.line).toBe("12B");
  });

  it("does not fall back to delivery or life neighborhood when master is missing", () => {
    const state = resolveDeliveryHomeHeaderStateFromSnapshot(
      snapshot({
        defaults: {
          delivery: addr({
            id: "d1",
            neighborhoodName: "Malate",
            buildingName: "Tower",
          }),
        },
        neighborhoodFromLife: { complete: true, label: "Quezon City · Diliman" },
      })
    );
    expect(state).toEqual({
      status: "ready",
      line: null,
      hasLinkedAddress: false,
    });
  });

  it("FULL 내정보 line is master only — no trade fallback", () => {
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
    expect(line).toBeNull();
  });

  it("flags auth failures for boot retry", () => {
    expect(shouldRetryAddressDefaultsSnapshotFetch(snapshot({ ok: false, status: 401 }))).toBe(true);
    expect(shouldRetryAddressDefaultsSnapshotFetch(snapshot({ ok: true, status: 200, defaults: {} }))).toBe(false);
  });
});
