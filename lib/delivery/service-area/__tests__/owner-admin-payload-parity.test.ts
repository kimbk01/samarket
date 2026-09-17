import { describe, expect, it } from "vitest";
import { buildDeliveryServiceAreaEditorPayload } from "@/lib/delivery/service-area/build-service-area-editor-payload";
import type { StoreDeliveryServiceAreaRow } from "@/lib/delivery/service-area/store-delivery-service-areas";

describe("Owner/Admin editor payload parity", () => {
  const store = {
    city: "Quezon City",
    region: "Metro Manila",
    lat: 14.676,
    lng: 121.0437,
    delivery_radius_km: 10,
    delivery_service_area_authority: "legacy_radius",
    store_name: "Parity Store",
  };

  const selected: StoreDeliveryServiceAreaRow[] = [
    {
      geoIdentity: "1381300000",
      areaType: "city_municipality",
      displayNameSnapshot: "Quezon City",
      source: "owner",
      isStoreHome: true,
    },
    {
      geoIdentity: "far-city",
      areaType: "city_municipality",
      displayNameSnapshot: "Far City",
      source: "admin",
      isStoreHome: false,
    },
  ];

  it("OWNER READ and ADMIN READ produce identical selected IDs / R / authority", () => {
    const owner = buildDeliveryServiceAreaEditorPayload(store, selected);
    const admin = buildDeliveryServiceAreaEditorPayload(store, selected);
    expect(owner.selectedGeoIdentities).toEqual(admin.selectedGeoIdentities);
    expect(owner.selectedGeoIdentities).toEqual(["1381300000", "far-city"].sort());
    expect(owner.referenceDistanceKm).toBe(admin.referenceDistanceKm);
    expect(owner.referenceDistanceKm).toBe(10);
    expect(owner.candidateSearchKm).toBe(admin.candidateSearchKm);
    expect(owner.candidateSearchKm).toBe(20);
    expect(owner.authorityMode).toBe(admin.authorityMode);
    expect(owner.authorityMode).toBe("legacy_radius");
    expect(owner.storeHomeLguId).toBe(admin.storeHomeLguId);
  });

  it("store-home is default-selected when selection empty, and remains removable in payload", () => {
    const empty = buildDeliveryServiceAreaEditorPayload(store, []);
    const home = empty.candidates.find((c) => c.isStoreHome);
    expect(home).toBeTruthy();
    expect(home?.selected).toBe(true);
    expect(empty.selectionSource).toBe("initial_base_default");
    // Initial setup: all base-range candidates proposed selected
    for (const c of empty.candidates) {
      if (c.isWithinBaseRange || c.isStoreHome) expect(c.selected).toBe(true);
    }
    // Removable: no forced lock field — selection is a plain boolean Owner/Admin may flip.
    expect(home && "locked" in home).toBe(false);
  });

  it("far city in selectedAreas appears in selectedGeoIdentities", () => {
    const payload = buildDeliveryServiceAreaEditorPayload(store, selected);
    expect(payload.selectedGeoIdentities).toContain("far-city");
    expect(payload.selectedCount).toBe(2);
  });
});
