import { describe, expect, it } from "vitest";
import { assertStoreLocationPatchConsistent } from "@/lib/stores/store-location-patch-consistency";

describe("assertStoreLocationPatchConsistent — text-only prevention", () => {
  const current = {
    place_id: null,
    formatted_address: null,
    address_line1: null,
    lat: null,
    lng: null,
  };

  it("rejects identity change without coords", () => {
    expect(
      assertStoreLocationPatchConsistent(current, {
        address_line1: "123 Test St",
        formatted_address: "123 Test St, Quezon City",
      })
    ).toBe("store_location_inconsistent");
  });

  it("accepts identity + finite coords together", () => {
    expect(
      assertStoreLocationPatchConsistent(current, {
        address_line1: "123 Test St",
        formatted_address: "123 Test St, Quezon City",
        place_id: "ChIJtest",
        lat: 14.65,
        lng: 121.05,
      })
    ).toBe("ok");
  });

  it("rejects place_id without coords", () => {
    expect(
      assertStoreLocationPatchConsistent(current, {
        place_id: "ChIJtest",
        formatted_address: "Somewhere",
      })
    ).toBe("store_location_inconsistent");
  });
});
