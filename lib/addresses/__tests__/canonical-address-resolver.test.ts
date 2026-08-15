import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCanonicalDraftFromPlaceResult } from "@/lib/addresses/canonical-address-resolver";
import {
  applySelectedPlaceIdentity,
  resolvePinMoveAgainstSelectedIdentity,
  selectedPlaceIdentityFromDraft,
  stripSelectedPlaceIdentity,
  type CanonicalAddressDraft,
} from "@/lib/addresses/canonical-address-draft";
import {
  displayInputFromDraft,
  resolveCanonicalDisplayLines,
} from "@/lib/addresses/canonical-address-display";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function component(long: string, types: string[]): google.maps.GeocoderAddressComponent {
  return { long_name: long, short_name: long, types };
}

describe("canonical resolver hard bans", () => {
  it("does not invent placeName from formatted.split", () => {
    const src = read("lib/addresses/canonical-address-resolver.ts");
    expect(src).not.toMatch(/formatted\.split\s*\(\s*[\"'],[\"']\s*\)/);
    expect(src).not.toContain("searchNearbyAsLegacyPlaceResults");
    expect(src).not.toContain("NEARBY_FALLBACK_MAX_DISTANCE_METERS");
    expect(src).not.toContain("SAME_PLACE_METERS");
  });

  it("pin identity uses viewport or geocoder place_id, not magic meters", () => {
    const src = read("lib/addresses/canonical-address-resolver.ts");
    expect(src).toContain("isPinInsidePreferredViewport");
    expect(src).toContain("geocoderMentionsPlaceId");
  });

  it("same-place pin keeps the selected Place name, not street-component filtering", () => {
    const src = read("lib/addresses/canonical-address-resolver.ts");
    expect(src).toContain('identitySource === "preferred_place"');
    expect(src).toContain("preferred?.placeName");
  });
});

describe("canonical resolver Place Details → draft", () => {
  it("GOOGLE MALL: keeps Place name + street/city, never formatted-head as name", () => {
    const draft = buildCanonicalDraftFromPlaceResult({
      name: "SM Mall of Asia",
      place_id: "ChIJ-mall-moa",
      formatted_address: "SM Mall of Asia, Seaside Blvd, Pasay, Metro Manila, Philippines",
      types: ["shopping_mall", "point_of_interest", "establishment"],
      geometry: { location: { lat: () => 14.5352, lng: () => 120.9822 } as google.maps.LatLng },
      address_components: [
        component("Seaside Boulevard", ["route"]),
        component("Pasay", ["locality"]),
        component("Metro Manila", ["administrative_area_level_1"]),
        component("Philippines", ["country", "political"]),
      ],
    });
    expect(draft).not.toBeNull();
    expect(draft?.placeName).toBe("SM Mall of Asia");
    expect(draft?.identitySource).toBe("place_details");
    expect(draft?.streetAddress).toBe("Seaside Boulevard");
    expect(draft?.cityMunicipality).toBe("Pasay");
    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(draft!));
    expect(lines.title).toBe("SM Mall of Asia");
    expect(lines.addressLine).toContain("Seaside Boulevard");
    expect(lines.addressLine).toContain("Pasay");
  });

  it("RESIDENTIAL: no Place name → street is title, barangay/city is address", () => {
    const draft = buildCanonicalDraftFromPlaceResult({
      name: undefined,
      place_id: "ChIJ-house",
      formatted_address: "123 Sampaguita Street, San Antonio, Pasig, Metro Manila, Philippines",
      types: ["street_address"],
      geometry: { location: { lat: () => 14.576, lng: () => 121.085 } as google.maps.LatLng },
      address_components: [
        component("123", ["street_number"]),
        component("Sampaguita Street", ["route"]),
        component("San Antonio", ["sublocality_level_1", "sublocality", "political"]),
        component("Pasig", ["locality", "political"]),
        component("Metro Manila", ["administrative_area_level_1"]),
        component("Philippines", ["country", "political"]),
      ],
    });
    expect(draft).not.toBeNull();
    expect(draft?.placeName).toBeNull();
    expect(draft?.identitySource).toBe("address_only");
    expect(draft?.streetAddress).toBe("123 Sampaguita Street");
    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(draft!));
    expect(lines.title).toBe("123 Sampaguita Street");
    expect(lines.addressLine).toContain("San Antonio");
    expect(lines.addressLine).toContain("Pasig");
  });
});

function draft(overrides: Partial<CanonicalAddressDraft>): CanonicalAddressDraft {
  return {
    latitude: 14.642,
    longitude: 121.038,
    placeId: null,
    placeName: null,
    placeTypes: [],
    streetNumber: null,
    route: null,
    streetAddress: null,
    barangay: null,
    cityMunicipality: "Quezon City",
    province: "Metro Manila",
    postalCode: null,
    neighborhoodName: null,
    formattedAddress: null,
    identitySource: "address_only",
    samePlaceAsPreferred: false,
    ...overrides,
  };
}

describe("A+C pin identity vs delivery location", () => {
  it("1. Tycoon search select → title is POI", () => {
    const selected = draft({
      placeId: "ChIJ-tycoon",
      placeName: "Tycoon Center Bldg.",
      streetAddress: "Pearl Drive",
      barangay: "San Antonio",
      cityMunicipality: "Pasig",
      identitySource: "place_details",
    });
    expect(resolveCanonicalDisplayLines(displayInputFromDraft(selected)).title).toBe("Tycoon Center Bldg.");
    expect(selectedPlaceIdentityFromDraft(selected)).toMatchObject({
      placeId: "ChIJ-tycoon",
      placeName: "Tycoon Center Bldg.",
    });
  });

  it("2-3. small / repeated drag inside trusted context → auto_keep without prompt", () => {
    const selected = selectedPlaceIdentityFromDraft(
      draft({
        placeId: "ChIJ-tycoon",
        placeName: "Tycoon Center Bldg.",
        identitySource: "place_details",
      }),
    );
    const first = resolvePinMoveAgainstSelectedIdentity(
      draft({
        latitude: 14.5861,
        longitude: 121.0611,
        placeId: "street-pearl-1",
        streetAddress: "Pearl Drive",
        barangay: "San Antonio",
        cityMunicipality: "Pasig",
        samePlaceAsPreferred: true,
      }),
      selected,
    );
    const second = resolvePinMoveAgainstSelectedIdentity(
      draft({
        latitude: 14.5862,
        longitude: 121.0612,
        placeId: "street-pearl-2",
        streetAddress: "Pearl Drive",
        barangay: "San Antonio",
        cityMunicipality: "Pasig",
        samePlaceAsPreferred: true,
      }),
      selected,
    );

    expect(first.kind).toBe("auto_keep");
    expect(second.kind).toBe("auto_keep");
    if (first.kind === "auto_keep" && second.kind === "auto_keep") {
      expect(first.draft.placeName).toBe("Tycoon Center Bldg.");
      expect(second.draft.placeName).toBe("Tycoon Center Bldg.");
      expect(second.draft.placeId).toBe("ChIJ-tycoon");
      expect(second.draft.latitude).toBe(14.5862);
    }
  });

  it("4. same barangay different building → not automatically same POI", () => {
    const selected = {
      placeId: "ChIJ-tycoon",
      placeName: "Tycoon Center Bldg.",
    };
    const otherBuilding = resolvePinMoveAgainstSelectedIdentity(
      draft({
        placeId: "street-other",
        placeName: null,
        streetAddress: "1 Garden Way",
        barangay: "San Antonio",
        cityMunicipality: "Pasig",
        samePlaceAsPreferred: false,
      }),
      selected,
    );
    expect(otherBuilding.kind).toBe("needs_resolution");
  });

  it("5-6. Pasig → Mandaluyong Ortigas: no city-based auto-clear; trust lost → resolution", () => {
    const selected = {
      placeId: "ChIJ-tycoon",
      placeName: "Tycoon Center Bldg.",
    };
    const ortigas = resolvePinMoveAgainstSelectedIdentity(
      draft({
        latitude: 14.5895,
        longitude: 121.0568,
        placeId: "street-garden-way",
        placeName: null,
        streetAddress: "1 Garden Way",
        barangay: "Wack Wack Greenhills",
        cityMunicipality: "Mandaluyong City",
        province: "Metro Manila",
        formattedAddress: "1 Garden Way, Ortigas Center, Mandaluyong City",
        samePlaceAsPreferred: false,
      }),
      selected,
    );

    expect(ortigas.kind).toBe("needs_resolution");
    if (ortigas.kind === "needs_resolution") {
      expect(ortigas.selectedIdentity.placeName).toBe("Tycoon Center Bldg.");
      expect(ortigas.locationDraft.placeName).toBeNull();
      expect(ortigas.locationDraft.placeId).toBeNull();
      expect(ortigas.locationDraft.streetAddress).toBe("1 Garden Way");
      expect(ortigas.locationDraft.cityMunicipality).toBe("Mandaluyong City");
    }
  });

  it("7. KEEP selected place → POI identity preserved with refined pin", () => {
    const selected = {
      placeId: "ChIJ-tycoon",
      placeName: "Tycoon Center Bldg.",
    };
    const location = draft({
      latitude: 14.5895,
      longitude: 121.0568,
      placeId: "street-garden-way",
      streetAddress: "1 Garden Way",
      barangay: "Wack Wack Greenhills",
      cityMunicipality: "Mandaluyong City",
      samePlaceAsPreferred: false,
    });
    const kept = applySelectedPlaceIdentity(stripSelectedPlaceIdentity(location), selected);
    expect(kept.placeName).toBe("Tycoon Center Bldg.");
    expect(kept.placeId).toBe("ChIJ-tycoon");
    expect(kept.latitude).toBe(14.5895);
    expect(kept.streetAddress).toBe("1 Garden Way");
    expect(kept.cityMunicipality).toBe("Mandaluyong City");
  });

  it("8-9. USE pin location → POI cleared; street reverse placeId not promoted", () => {
    const location = draft({
      placeId: "street-garden-way",
      streetAddress: "1 Garden Way",
      cityMunicipality: "Mandaluyong City",
    });
    const cleared = stripSelectedPlaceIdentity(location);
    expect(cleared.placeName).toBeNull();
    expect(cleared.placeId).toBeNull();
    expect(cleared.streetAddress).toBe("1 Garden Way");
    expect(resolveCanonicalDisplayLines(displayInputFromDraft(cleared)).title).toBe("1 Garden Way");
  });

  it("10. explicit new POI search → identity replaced", () => {
    const oldIdentity = selectedPlaceIdentityFromDraft(
      draft({ placeId: "ChIJ-tycoon", placeName: "Tycoon Center Bldg.", identitySource: "place_details" }),
    );
    const newIdentity = selectedPlaceIdentityFromDraft(
      draft({
        placeId: "poi-mannmaru",
        placeName: "Mannmaru Japanese Restaurant QC",
        identitySource: "place_details",
      }),
    );
    expect(oldIdentity?.placeName).toBe("Tycoon Center Bldg.");
    expect(newIdentity).toMatchObject({
      placeId: "poi-mannmaru",
      placeName: "Mannmaru Japanese Restaurant QC",
    });
  });

  it("11. placeName/placeId identity consistency on keep", () => {
    const kept = applySelectedPlaceIdentity(
      draft({ streetAddress: "1 Garden Way", placeId: "street-x" }),
      { placeId: "ChIJ-tycoon", placeName: "Tycoon Center Bldg." },
    );
    expect(kept.placeName).toBe("Tycoon Center Bldg.");
    expect(kept.placeId).toBe("ChIJ-tycoon");
  });

  it("12. save selected POI + refined pin payload", () => {
    const kept = applySelectedPlaceIdentity(
      draft({
        latitude: 14.5895,
        longitude: 121.0568,
        streetAddress: "1 Garden Way",
        barangay: "Wack Wack Greenhills",
        cityMunicipality: "Mandaluyong City",
        formattedAddress: "1 Garden Way, Ortigas Center, Mandaluyong City",
      }),
      { placeId: "ChIJ-tycoon", placeName: "Tycoon Center Bldg." },
    );
    expect({
      buildingName: kept.placeName,
      placeId: kept.placeId,
      latitude: kept.latitude,
      streetAddress: kept.streetAddress,
    }).toEqual({
      buildingName: "Tycoon Center Bldg.",
      placeId: "ChIJ-tycoon",
      latitude: 14.5895,
      streetAddress: "1 Garden Way",
    });
  });

  it("13. save location-only payload clears POI placeId", () => {
    const only = stripSelectedPlaceIdentity(
      draft({
        placeId: "street-garden-way",
        streetAddress: "1 Garden Way",
        formattedAddress: "1 Garden Way, Ortigas Center, Mandaluyong City",
      }),
    );
    expect(only.placeName).toBeNull();
    expect(only.placeId).toBeNull();
  });

  it("road-only initial address creates no fake building identity", () => {
    const roadOnly = draft({
      placeId: "street-limbaga",
      placeName: null,
      streetAddress: "Sct. Limbaga Street",
      barangay: "Diliman",
    });
    const identity = selectedPlaceIdentityFromDraft(roadOnly);
    const resolved = resolvePinMoveAgainstSelectedIdentity(roadOnly, identity);
    expect(identity).toBeNull();
    expect(resolved.kind).toBe("location_only");
    if (resolved.kind === "location_only") {
      expect(resolved.draft.placeId).toBeNull();
      expect(resolveCanonicalDisplayLines(displayInputFromDraft(resolved.draft)).title).toBe(
        "Sct. Limbaga Street",
      );
    }
  });

  it("no road falls back to Barangay without inventing POI", () => {
    const barangayOnly = draft({
      placeId: "brgy-diliman",
      placeName: null,
      streetAddress: null,
      route: null,
      barangay: "Diliman",
    });
    expect(selectedPlaceIdentityFromDraft(barangayOnly)).toBeNull();
    expect(resolveCanonicalDisplayLines(displayInputFromDraft(barangayOnly)).title).toBe(
      "Barangay Diliman",
    );
  });

  it("central helper does not use city/barangay as POI boundary authority", () => {
    const src = read("lib/addresses/canonical-address-draft.ts");
    expect(src).toContain("resolvePinMoveAgainstSelectedIdentity");
    expect(src).not.toContain("isSelectedPlaceIdentityConsistentWithLocation");
    expect(src).not.toMatch(/cityMunicipality.*preferred/i);
    expect(src).not.toMatch(/same barangay/i);
    expect(src).not.toMatch(/distance\s*[><=]/i);
  });
});
