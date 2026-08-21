import { describe, expect, it } from "vitest";
import { buildStoreLocationPatchFields } from "@/lib/stores/build-store-location-patch";

const current = {
  region: "NCR",
  city: "Manila",
  district: "Binondo",
  address_line1: "Binondo",
  address_line2: null as string | null,
  place_id: "place-1",
  formatted_address: "Binondo, Manila",
  lat: 14.6,
  lng: 120.98,
};

describe("buildStoreLocationPatchFields", () => {
  it("rejects address identity change without coords", () => {
    const r = buildStoreLocationPatchFields(current, {
      address_line1: "Makati Ave",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("store_location_inconsistent");
  });

  it("accepts address change with paired lat/lng", () => {
    const r = buildStoreLocationPatchFields(current, {
      address_line1: "Makati Ave",
      lat: 14.55,
      lng: 121.02,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.touched).toBe(true);
      expect(r.patch.address_line1).toBeTruthy();
      expect(r.patch.lat).toBe(14.55);
      expect(r.patch.lng).toBe(121.02);
      expect(r.patch.district).toBe(r.patch.address_line1);
    }
  });

  it("allows detail_address-only without touching coords", () => {
    const r = buildStoreLocationPatchFields(current, {
      detail_address: "Unit 2B",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch.detail_address).toBe("Unit 2B");
      expect(r.patch.lat).toBeUndefined();
    }
  });
});
