import { describe, expect, it } from "vitest";
import { assertStoreLocationPatchConsistent } from "@/lib/stores/store-location-patch-consistency";

const current = {
  place_id: "ChIJ1",
  formatted_address: "Commonwealth Ave, QC",
  address_line1: "Commonwealth Ave",
  lat: 14.65,
  lng: 121.05,
};

describe("store location patch consistency", () => {
  it("allows detail-unrelated patches and identical street", () => {
    expect(assertStoreLocationPatchConsistent(current, {})).toBe("ok");
    expect(
      assertStoreLocationPatchConsistent(current, { address_line1: "Commonwealth Ave" }),
    ).toBe("ok");
  });

  it("rejects street/formatted/place change without lat/lng in the same PATCH", () => {
    expect(
      assertStoreLocationPatchConsistent(current, { address_line1: "Katipunan Ave" }),
    ).toBe("store_location_inconsistent");
    expect(
      assertStoreLocationPatchConsistent(current, {
        formatted_address: "Katipunan Ave, QC",
      }),
    ).toBe("store_location_inconsistent");
  });

  it("allows identity change when lat/lng are sent together", () => {
    expect(
      assertStoreLocationPatchConsistent(current, {
        address_line1: "Katipunan Ave",
        formatted_address: "Katipunan Ave, QC",
        place_id: "ChIJ2",
        lat: 14.64,
        lng: 121.07,
      }),
    ).toBe("ok");
  });

  it("rejects place_id without formatted + coords", () => {
    expect(
      assertStoreLocationPatchConsistent(current, { place_id: "ChIJ2" }),
    ).toBe("store_location_inconsistent");
  });

  it("rejects lat without lng", () => {
    expect(assertStoreLocationPatchConsistent(current, { lat: 14.6 })).toBe("store_location_inconsistent");
  });
});
