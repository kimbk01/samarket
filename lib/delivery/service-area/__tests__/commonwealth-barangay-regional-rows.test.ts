import { describe, expect, it } from "vitest";
import { buildDeliveryServiceAreaEditorPayload } from "@/lib/delivery/service-area/build-service-area-editor-payload";
import { resolveStoreHomeLguId } from "@/lib/delivery/service-area/candidate-discovery";

describe("Commonwealth / barangay-in-city store regional rows", () => {
  it("resolves Quezon City from region when city is Commonwealth barangay", () => {
    const home = resolveStoreHomeLguId({
      cityMunicipality: "Commonwealth",
      province: "Quezon City",
      storeLat: null,
      storeLng: null,
    });
    expect(home).toBe("1381300000");
  });

  it("builds primary+extended candidates from home LGU centroid when lat/lng missing", () => {
    const payload = buildDeliveryServiceAreaEditorPayload(
      {
        city: "Commonwealth",
        region: "Quezon City",
        lat: null,
        lng: null,
        delivery_radius_km: 10,
        delivery_service_area_authority: "legacy_radius",
        store_name: "만두네집",
      },
      []
    );

    expect(payload.storeHomeLguId).toBe("1381300000");
    expect(payload.storeHomeDisplayName).toMatch(/Quezon City/i);
    expect(payload.storeNeighborhoodLabel).toBe("Commonwealth");
    expect(payload.referenceDistanceKm).toBe(10);
    expect(payload.candidateSearchKm).toBe(20);
    expect(payload.candidates.length).toBeGreaterThan(0);

    const home = payload.candidates.find((c) => c.isStoreHome);
    expect(home?.geoIdentity).toBe("1381300000");
    expect(home?.selected).toBe(true);

    const primary = payload.candidates.filter((c) => c.isWithinBaseRange || c.isStoreHome);
    const extended = payload.candidates.filter((c) => c.isWithinExtendedRange);
    expect(primary.length).toBeGreaterThan(0);
    expect(extended.length).toBeGreaterThan(0);
    // Extended default unselected on initial proposal.
    for (const c of extended) expect(c.selected).toBe(false);
  });
});
