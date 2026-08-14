import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCanonicalDraftFromPlaceResult } from "@/lib/addresses/canonical-address-resolver";
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
