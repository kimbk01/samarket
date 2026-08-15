import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCanonicalDraftFromPlaceResult } from "@/lib/addresses/canonical-address-resolver";
import {
  preserveSelectedPlaceIdentity,
  selectedPlaceIdentityFromDraft,
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

describe("canonical draft place identity preservation", () => {
  it("search POI selected -> title is POI", () => {
    const selected = draft({
      placeId: "poi-gogii",
      placeName: "Gogii Yoli",
      streetAddress: "Sct. Torillo Street",
      barangay: "Diliman",
      identitySource: "place_details",
    });

    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(selected));

    expect(lines.title).toBe("Gogii Yoli");
  });

  it("POI selected -> pin drag street_address preserves placeName and selected placeId", () => {
    const selected = selectedPlaceIdentityFromDraft(
      draft({
        placeId: "poi-gogii",
        placeName: "Gogii Yoli",
        streetAddress: "Sct. Torillo Street",
        barangay: "Diliman",
        identitySource: "place_details",
      }),
    );
    const reverseStreet = draft({
      latitude: 14.6431,
      longitude: 121.0391,
      placeId: "street-limbaga",
      placeName: null,
      streetAddress: "Sct. Limbaga Street",
      barangay: "Diliman",
      formattedAddress: "Sct. Limbaga Street, Barangay Diliman, Quezon City, Metro Manila",
      identitySource: "address_only",
    });

    const merged = preserveSelectedPlaceIdentity(reverseStreet, selected);
    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(merged));

    expect(merged.placeName).toBe("Gogii Yoli");
    expect(merged.placeId).toBe("poi-gogii");
    expect(merged.latitude).toBe(14.6431);
    expect(merged.longitude).toBe(121.0391);
    expect(merged.streetAddress).toBe("Sct. Limbaga Street");
    expect(merged.barangay).toBe("Diliman");
    expect(lines.title).toBe("Gogii Yoli");
    expect(lines.addressLine).toContain("Sct. Limbaga Street");
  });

  it("POI selected -> pin drag route preserves buildingName source", () => {
    const selected = {
      placeId: "poi-mannmaru",
      placeName: "Mannmaru Japanese Restaurant QC",
      barangay: "Diliman",
      cityMunicipality: "Quezon City",
      province: "Metro Manila",
    };
    const reverseRoute = draft({
      latitude: 14.6412,
      longitude: 121.0378,
      placeId: "route-tuason",
      route: "Sct. Tuason Street",
      streetAddress: "Sct. Tuason Street",
      barangay: "Diliman",
    });

    const merged = preserveSelectedPlaceIdentity(reverseRoute, selected);

    expect(merged.placeName).toBe("Mannmaru Japanese Restaurant QC");
    expect(merged.placeId).toBe("poi-mannmaru");
    expect(merged.streetAddress).toBe("Sct. Tuason Street");
  });

  it("repeated pin drag keeps original selected identity while updating location", () => {
    const selected = {
      placeId: "poi-gogii",
      placeName: "Gogii Yoli",
      cityMunicipality: "Quezon City",
      province: "Metro Manila",
    };
    const first = preserveSelectedPlaceIdentity(
      draft({ latitude: 14.6431, longitude: 121.0391, placeId: "street-1", streetAddress: "Sct. Limbaga Street" }),
      selected,
    );
    const second = preserveSelectedPlaceIdentity(
      draft({ latitude: 14.6442, longitude: 121.0402, placeId: "street-2", streetAddress: "Sct. Tuason Street" }),
      selected,
    );

    expect(first.placeName).toBe("Gogii Yoli");
    expect(second.placeName).toBe("Gogii Yoli");
    expect(second.placeId).toBe("poi-gogii");
    expect(second.latitude).toBe(14.6442);
    expect(second.streetAddress).toBe("Sct. Tuason Street");
  });

  it("save payload can preserve buildingName while using moved coordinates and street", () => {
    const merged = preserveSelectedPlaceIdentity(
      draft({
        latitude: 14.6431,
        longitude: 121.0391,
        placeId: "street-limbaga",
        streetAddress: "Sct. Limbaga Street",
        barangay: "Diliman",
        formattedAddress: "Sct. Limbaga Street, Barangay Diliman, Quezon City, Metro Manila",
      }),
      {
        placeId: "poi-gogii",
        placeName: "Gogii Yoli",
        barangay: "Diliman",
        cityMunicipality: "Quezon City",
        province: "Metro Manila",
      },
    );
    const saveBody = {
      buildingName: merged.placeName,
      latitude: merged.latitude,
      longitude: merged.longitude,
      streetAddress: merged.streetAddress,
      barangay: merged.barangay,
      placeId: merged.placeId,
    };

    expect(saveBody).toEqual({
      buildingName: "Gogii Yoli",
      latitude: 14.6431,
      longitude: 121.0391,
      streetAddress: "Sct. Limbaga Street",
      barangay: "Diliman",
      placeId: "poi-gogii",
    });
  });

  it("explicit new POI selection replaces old identity", () => {
    const oldIdentity = selectedPlaceIdentityFromDraft(
      draft({ placeId: "poi-gogii", placeName: "Gogii Yoli", identitySource: "place_details" }),
    );
    const newIdentity = selectedPlaceIdentityFromDraft(
      draft({
        placeId: "poi-mannmaru",
        placeName: "Mannmaru Japanese Restaurant QC",
        identitySource: "place_details",
      }),
    );

    expect(oldIdentity?.placeName).toBe("Gogii Yoli");
    expect(newIdentity).toMatchObject({
      placeId: "poi-mannmaru",
      placeName: "Mannmaru Japanese Restaurant QC",
    });
  });

  it("large displacement to another Barangay invalidates stale POI identity", () => {
    const selected = {
      placeId: "poi-gogii",
      placeName: "Gogii Yoli",
      barangay: "Diliman",
      cityMunicipality: "Quezon City",
      province: "Metro Manila",
    };
    const reverseFar = draft({
      latitude: 14.6201,
      longitude: 121.0511,
      placeId: "street-kamuning",
      placeName: null,
      streetAddress: "Kamuning Road",
      barangay: "Kamuning",
      cityMunicipality: "Quezon City",
      province: "Metro Manila",
      formattedAddress: "Kamuning Road, Barangay Kamuning, Quezon City, Metro Manila",
    });

    const merged = preserveSelectedPlaceIdentity(reverseFar, selected);
    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(merged));

    expect(merged.placeName).toBeNull();
    expect(merged.placeId).toBe("street-kamuning");
    expect(merged.identitySource).toBe("address_only");
    expect(lines.title).toBe("Kamuning Road");
  });

  it("large displacement to another city invalidates stale POI placeName and placeId unit", () => {
    const selected = {
      placeId: "poi-gogii",
      placeName: "Gogii Yoli",
      barangay: "Diliman",
      cityMunicipality: "Quezon City",
      province: "Metro Manila",
    };
    const reverseFar = draft({
      latitude: 14.556,
      longitude: 121.023,
      placeId: "street-makati",
      placeName: null,
      streetAddress: "Ayala Avenue",
      barangay: "San Lorenzo",
      cityMunicipality: "Makati",
      province: "Metro Manila",
      formattedAddress: "Ayala Avenue, Barangay San Lorenzo, Makati, Metro Manila",
    });

    const merged = preserveSelectedPlaceIdentity(reverseFar, selected);

    expect(merged.placeName).toBeNull();
    expect(merged.placeId).toBe("street-makati");
    expect(merged.samePlaceAsPreferred).toBe(false);
  });

  it("road-only initial address creates no fake building identity and falls back to road", () => {
    const roadOnly = draft({
      placeId: "street-limbaga",
      placeName: null,
      streetAddress: "Sct. Limbaga Street",
      barangay: "Diliman",
    });

    const identity = selectedPlaceIdentityFromDraft(roadOnly);
    const merged = preserveSelectedPlaceIdentity(roadOnly, identity);
    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(merged));

    expect(identity).toBeNull();
    expect(merged.placeName).toBeNull();
    expect(lines.title).toBe("Sct. Limbaga Street");
  });

  it("no road falls back to Barangay without inventing POI", () => {
    const barangayOnly = draft({
      placeId: "brgy-diliman",
      placeName: null,
      streetAddress: null,
      route: null,
      barangay: "Diliman",
    });

    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(barangayOnly));

    expect(selectedPlaceIdentityFromDraft(barangayOnly)).toBeNull();
    expect(lines.title).toBe("Barangay Diliman");
  });
});
