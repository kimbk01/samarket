import { describe, expect, it } from "vitest";
import {
  EDITOR_DIFFERENT_PREMISE_MIN_M,
  EDITOR_SAME_PREMISE_MAX_M,
  editorPlacePreviewHeadline,
  editorPlacePreviewSubline,
  identityFromPlaceDetails,
  mapPlaceIdentityToWriteFields,
  reconcileIdentityAfterPinMove,
  type EditorPlaceIdentity,
} from "@/lib/addresses/editor-place-identity";
import type { ReverseGeocodePhResult } from "@/lib/addresses/reverse-geocode-ph-client";

function place(
  components: Array<{ long_name: string; types: string[] }>,
  opts?: { name?: string; formatted?: string; placeId?: string; types?: string[] },
): google.maps.places.PlaceResult {
  return {
    name: opts?.name,
    place_id: opts?.placeId ?? "ChIJ_test",
    formatted_address: opts?.formatted ?? "Seaside Blvd, Pasay, Metro Manila, Philippines",
    types: opts?.types,
    address_components: components.map((c) => ({
      long_name: c.long_name,
      short_name: c.long_name,
      types: c.types,
    })),
  } as google.maps.places.PlaceResult;
}

function reverse(partial: Partial<ReverseGeocodePhResult> & Pick<ReverseGeocodePhResult, "latitude" | "longitude" | "formattedAddress">): ReverseGeocodePhResult {
  return {
    placeId: partial.placeId ?? "ChIJ_rev",
    parsed: partial.parsed ?? {
      barangay: null,
      cityMunicipality: "Pasay",
      province: "Metro Manila",
      neighborhood: null,
      routeLine: "Seaside Boulevard",
      buildingOrPlaceHeadline: null,
      premiseName: null,
    },
    buildingOrPlaceNames: partial.buildingOrPlaceNames ?? [],
    ...partial,
  };
}

const smAnchor: EditorPlaceIdentity = {
  placeId: "ChIJ_sm",
  placeDisplayName: "SM Mall of Asia",
  buildingName: "",
  landmarkName: "",
  streetAddress: "Seaside Boulevard",
  formattedAddress: "Seaside Blvd, Pasay, Metro Manila, Philippines",
  barangay: "",
  cityMunicipality: "Pasay",
  province: "Metro Manila",
  neighborhoodName: "",
  latitude: 14.535,
  longitude: 120.982,
};

describe("identityFromPlaceDetails", () => {
  it("keeps place display name separate from street (mall POI)", () => {
    const id = identityFromPlaceDetails(
      place(
        [
          { long_name: "Seaside Boulevard", types: ["route"] },
          { long_name: "Pasay", types: ["locality"] },
          { long_name: "Metro Manila", types: ["administrative_area_level_1"] },
        ],
        {
          name: "SM Mall of Asia",
          types: ["shopping_mall", "point_of_interest", "establishment"],
          placeId: "ChIJ_sm",
        },
      ),
      14.535,
      120.982,
    );
    expect(id.placeDisplayName).toBe("SM Mall of Asia");
    expect(id.streetAddress).toBe("Seaside Boulevard");
    expect(id.buildingName).toBe("");
    expect(id.formattedAddress).toContain("Pasay");
  });

  it("does not invent building when Google only returns place name", () => {
    const id = identityFromPlaceDetails(
      place([{ long_name: "Ayala Avenue", types: ["route"] }], {
        name: "One Ayala",
        types: ["premise", "point_of_interest"],
      }),
      14.55,
      121.02,
    );
    expect(id.placeDisplayName).toBe("One Ayala");
    expect(id.buildingName).toBe("");
  });

  it("sets buildingName from premise component when distinct from place name", () => {
    const id = identityFromPlaceDetails(
      place(
        [
          { long_name: "Tower A", types: ["premise"] },
          { long_name: "Ayala Avenue", types: ["route"] },
        ],
        { name: "Starbucks Reserve", types: ["cafe", "establishment"] },
      ),
      14.55,
      121.02,
    );
    expect(id.placeDisplayName).toBe("Starbucks Reserve");
    expect(id.buildingName).toBe("Tower A");
  });

  it("street-only place has empty placeDisplayName", () => {
    const id = identityFromPlaceDetails(
      place(
        [
          { long_name: "123", types: ["street_number"] },
          { long_name: "Example Street", types: ["route"] },
          { long_name: "Pasig", types: ["locality"] },
        ],
        { name: "123 Example Street", formatted: "123 Example Street, Pasig, Metro Manila" },
      ),
      14.58,
      121.06,
    );
    expect(id.placeDisplayName).toBe("");
    expect(id.streetAddress).toBe("123 Example Street");
  });
});

describe("reconcileIdentityAfterPinMove", () => {
  it("same-premise micro move keeps SM Mall of Asia when reverse is street-only", () => {
    const { identity, mode } = reconcileIdentityAfterPinMove({
      previous: smAnchor,
      anchor: smAnchor,
      reverse: reverse({
        latitude: smAnchor.latitude + 0.0003,
        longitude: smAnchor.longitude,
        formattedAddress: "Seaside Blvd, Pasay, Metro Manila, Philippines",
        placeId: "ChIJ_other_geocode",
        parsed: {
          barangay: null,
          cityMunicipality: "Pasay",
          province: "Metro Manila",
          neighborhood: null,
          routeLine: "Seaside Boulevard",
          buildingOrPlaceHeadline: null,
          premiseName: null,
        },
      }),
    });
    expect(mode).toBe("same_premise");
    expect(identity.placeDisplayName).toBe("SM Mall of Asia");
    expect(identity.latitude).not.toBe(smAnchor.latitude);
    expect(identity.streetAddress).toBe("Seaside Boulevard");
  });

  it("different-premise move drops stale mall name when reverse shows another POI", () => {
    const farLat = smAnchor.latitude + EDITOR_DIFFERENT_PREMISE_MIN_M / 111_000 + 0.002;
    const { identity, mode } = reconcileIdentityAfterPinMove({
      previous: smAnchor,
      anchor: smAnchor,
      reverse: reverse({
        latitude: farLat,
        longitude: smAnchor.longitude,
        formattedAddress: "Macapagal Blvd, Pasay, Metro Manila, Philippines",
        placeId: "ChIJ_starbucks",
        buildingOrPlaceNames: ["Starbucks Reserve"],
        parsed: {
          barangay: null,
          cityMunicipality: "Pasay",
          province: "Metro Manila",
          neighborhood: null,
          routeLine: "Macapagal Boulevard",
          buildingOrPlaceHeadline: "Starbucks Reserve",
          premiseName: null,
        },
      }),
    });
    expect(mode).toBe("different_premise");
    expect(identity.placeDisplayName).toBe("Starbucks Reserve");
    expect(identity.placeDisplayName).not.toBe("SM Mall of Asia");
  });

  it("does not keep stale business via ?? previousBuildingName when far + new POI", () => {
    const farLat = smAnchor.latitude + 0.01;
    expect(EDITOR_SAME_PREMISE_MAX_M).toBeLessThan(EDITOR_DIFFERENT_PREMISE_MIN_M);
    const { identity } = reconcileIdentityAfterPinMove({
      previous: { ...smAnchor, buildingName: "Old Building" },
      anchor: { ...smAnchor, buildingName: "Old Building" },
      reverse: reverse({
        latitude: farLat,
        longitude: smAnchor.longitude,
        formattedAddress: "Other Rd, Makati",
        buildingOrPlaceNames: ["Makati Medical Center"],
        parsed: {
          barangay: null,
          cityMunicipality: "Makati",
          province: "Metro Manila",
          neighborhood: null,
          routeLine: "Other Road",
          buildingOrPlaceHeadline: "Makati Medical Center",
          premiseName: null,
        },
      }),
    });
    expect(identity.placeDisplayName).toBe("Makati Medical Center");
    expect(identity.buildingName).not.toBe("Old Building");
  });
});

describe("preview + save map", () => {
  it("preview does not duplicate place name", () => {
    expect(
      editorPlacePreviewHeadline({
        placeDisplayName: "SM Mall of Asia",
        buildingName: "SM Mall of Asia",
      }),
    ).toBe("SM Mall of Asia");
    const sub = editorPlacePreviewSubline({
      placeDisplayName: "SM Mall of Asia",
      buildingName: "",
      streetAddress: "Seaside Boulevard",
      formattedAddress: "SM Mall of Asia, Seaside Blvd, Pasay",
      cityMunicipality: "Pasay",
    });
    expect(sub.toLowerCase().split("sm mall of asia").length - 1).toBeLessThanOrEqual(0);
    expect(sub).toContain("Seaside");
  });

  it("maps placeDisplayName into building_name without schema migration", () => {
    expect(
      mapPlaceIdentityToWriteFields(
        { placeDisplayName: "SM Mall of Asia", buildingName: "", landmarkName: "" },
        "",
      ),
    ).toEqual({ buildingName: "SM Mall of Asia", landmark: null });
    expect(
      mapPlaceIdentityToWriteFields(
        { placeDisplayName: "Starbucks Reserve", buildingName: "Tower A", landmarkName: "" },
        "",
      ),
    ).toEqual({ buildingName: "Starbucks Reserve", landmark: "Tower A" });
  });
});
