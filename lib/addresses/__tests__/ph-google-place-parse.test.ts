import { describe, expect, it } from "vitest";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";

function place(
  components: Array<{ long_name: string; short_name?: string; types: string[] }>,
  name?: string,
): google.maps.places.PlaceResult {
  return {
    name,
    address_components: components.map((c) => ({
      long_name: c.long_name,
      short_name: c.short_name ?? c.long_name,
      types: c.types,
    })),
  } as google.maps.places.PlaceResult;
}

describe("parsePhFromGooglePlaceResult mapping", () => {
  it("maps Pasig: barangay ≠ city ≠ Metro Manila", () => {
    const parsed = parsePhFromGooglePlaceResult(
      place(
        [
          { long_name: "123", types: ["street_number"] },
          { long_name: "Maharlika Street", types: ["route"] },
          { long_name: "San Antonio", types: ["sublocality_level_1", "sublocality", "political"] },
          { long_name: "Pasig", types: ["locality", "political"] },
          { long_name: "Metro Manila", types: ["administrative_area_level_1", "political"] },
          { long_name: "Philippines", types: ["country", "political"] },
          { long_name: "1605", types: ["postal_code"] },
        ],
        "Greenview Subdivision",
      ),
    );
    expect(parsed.routeLine).toBe("123 Maharlika Street");
    expect(parsed.barangay).toBe("San Antonio");
    expect(parsed.cityMunicipality).toBe("Pasig");
    expect(parsed.province).toBe("Metro Manila");
    expect(parsed.buildingOrPlaceHeadline).toBe("Greenview Subdivision");
  });

  it("never stores Metro Manila or Barangay as city_municipality", () => {
    const noLocality = parsePhFromGooglePlaceResult(
      place([
        { long_name: "San Antonio", types: ["sublocality_level_1", "sublocality"] },
        { long_name: "Metro Manila", types: ["administrative_area_level_1"] },
      ]),
    );
    expect(noLocality.cityMunicipality).toBeNull();
    expect(noLocality.barangay).toBe("San Antonio");
    expect(noLocality.province).toBe("Metro Manila");

    const metroAsLocality = parsePhFromGooglePlaceResult(
      place([
        { long_name: "Metro Manila", types: ["locality"] },
        { long_name: "Metro Manila", types: ["administrative_area_level_1"] },
      ]),
    );
    expect(metroAsLocality.cityMunicipality).toBeNull();
  });
});
