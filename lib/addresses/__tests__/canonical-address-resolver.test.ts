import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCanonicalDraftFromPlaceResult } from "@/lib/addresses/canonical-address-resolver";
import {
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
    expect(src).not.toContain("NEARBY_FALLBACK_MAX_DISTANCE_METERS");
    expect(src).not.toContain("SAME_PLACE_METERS");
  });

  it("FromLatLng delegates to CURRENT PIN resolver and ignores preferred", () => {
    const src = read("lib/addresses/canonical-address-resolver.ts");
    expect(src).toContain("resolveCurrentPinCanonicalAddress");
    expect(src).toContain("_preferred");
    expect(src).not.toContain("hasPreferredIdentity ? null : pickGeocoderPoiPlaceId");
  });

  it("Nearby + ranking live in CURRENT PIN module, not legacy preferred path", () => {
    const pin = read("lib/addresses/resolve-current-pin-canonical-address.ts");
    expect(pin).toContain("searchNearbyAsLegacyPlaceResults");
    expect(pin).toContain("rankCurrentPinIdentityCandidates");
    expect(pin).toContain("HARD_REJECT_ALWAYS_TYPES");
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

describe("CURRENT PIN SSOT — pin move never keeps old search identity", () => {
  it("search select draft still titles as POI before pin move", () => {
    const selected = draft({
      placeId: "ChIJ-tycoon",
      placeName: "Tycoon Center Bldg.",
      streetAddress: "Pearl Drive",
      barangay: "San Antonio",
      cityMunicipality: "Pasig",
      identitySource: "place_details",
    });
    expect(resolveCanonicalDisplayLines(displayInputFromDraft(selected)).title).toBe("Tycoon Center Bldg.");
  });

  it("legacy A+C helper now always returns location_only (old search is not authority)", () => {
    const selected = selectedPlaceIdentityFromDraft(
      draft({
        placeId: "ChIJ-tycoon",
        placeName: "Tycoon Center Bldg.",
        identitySource: "place_details",
      }),
    );
    const moved = resolvePinMoveAgainstSelectedIdentity(
      draft({
        latitude: 14.5862,
        longitude: 121.0612,
        placeId: "street-pearl-2",
        streetAddress: "Pearl Drive",
        samePlaceAsPreferred: true,
      }),
      selected,
    );
    expect(moved.kind).toBe("location_only");
    if (moved.kind === "location_only") {
      expect(moved.draft.placeName).toBeNull();
      expect(moved.draft.placeId).toBeNull();
    }
  });

  it("strip clears POI; street reverse placeId is not promoted", () => {
    const cleared = stripSelectedPlaceIdentity(
      draft({
        placeId: "street-garden-way",
        placeName: "Stale Name",
        streetAddress: "1 Garden Way",
        cityMunicipality: "Mandaluyong City",
      }),
    );
    expect(cleared.placeName).toBeNull();
    expect(cleared.placeId).toBeNull();
    expect(resolveCanonicalDisplayLines(displayInputFromDraft(cleared)).title).toBe("1 Garden Way");
  });

  it("road-only / barangay-only titles without inventing POI", () => {
    expect(
      resolveCanonicalDisplayLines(
        displayInputFromDraft(
          draft({
            placeName: null,
            streetAddress: "Sct. Limbaga Street",
            barangay: "Diliman",
          }),
        ),
      ).title,
    ).toBe("Sct. Limbaga Street");
    expect(
      resolveCanonicalDisplayLines(
        displayInputFromDraft(
          draft({
            placeName: null,
            streetAddress: null,
            route: null,
            barangay: "Diliman",
          }),
        ),
      ).title,
    ).toBe("Barangay Diliman");
  });

  it("Detail/Select wire CURRENT PIN resolver, not KEEP/USE", () => {
    const detail = read("components/addresses/AddressPlatformDetailClient.tsx");
    const select = read("components/map/AddressSelectClient.tsx");
    expect(detail).toContain("resolveCurrentPinCanonicalAddress");
    expect(select).toContain("resolveCurrentPinCanonicalAddress");
    expect(detail).not.toContain("addr_v2_identity_keep_selected");
    expect(select).not.toContain("addr_v2_identity_keep_selected");
  });
});
