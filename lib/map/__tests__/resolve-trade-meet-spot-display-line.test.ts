import { describe, expect, it } from "vitest";
import {
  looksLikePlusCodeAddress,
  pickGeocoderPoiPlaceId,
  pickStreetLikeGeocoderResult,
  stripLeadingPlusCodeFromFormatted,
} from "@/lib/map/resolve-trade-meet-spot-display-line";

describe("pickStreetLikeGeocoderResult", () => {
  it("도로형 결과가 있으면 랜드마크만 있는 첫 결과보다 우선", () => {
    const results = [
      { types: ["establishment", "point_of_interest"], formatted_address: "A", place_id: "a" },
      { types: ["street_address"], formatted_address: "B", place_id: "b" },
    ] as google.maps.GeocoderResult[];
    expect(pickStreetLikeGeocoderResult(results)?.place_id).toBe("b");
  });

  it("도로형이 없으면 첫 결과를 사용", () => {
    const results = [
      { types: ["establishment"], place_id: "x" },
    ] as google.maps.GeocoderResult[];
    expect(pickStreetLikeGeocoderResult(results)?.place_id).toBe("x");
  });

  it("Plus Code 도로 포맷보다 일반 도로 주소를 우선", () => {
    const results = [
      {
        types: ["street_address"],
        formatted_address: "J3C3+F7G, General Roxas Ave, Cubao",
        place_id: "plusy",
      },
      {
        types: ["route"],
        formatted_address: "General Roxas Ave, Cubao, Quezon City",
        place_id: "route",
      },
    ] as google.maps.GeocoderResult[];
    expect(pickStreetLikeGeocoderResult(results)?.place_id).toBe("route");
  });
});

describe("plus code helpers", () => {
  it("detects and strips leading plus codes", () => {
    expect(looksLikePlusCodeAddress("J3C3+F7G, General Roxas Ave")).toBe(true);
    expect(looksLikePlusCodeAddress("General Roxas Ave, Cubao")).toBe(false);
    expect(stripLeadingPlusCodeFromFormatted("J3C3+F7G, General Roxas Ave, Cubao")).toBe(
      "General Roxas Ave, Cubao"
    );
  });
});

describe("pickGeocoderPoiPlaceId", () => {
  it("establishment 타입 place_id 를 찾는다", () => {
    const results = [
      { types: ["street_address"], place_id: "street" },
      { types: ["establishment", "point_of_interest"], place_id: "poi" },
    ] as google.maps.GeocoderResult[];
    expect(pickGeocoderPoiPlaceId(results)).toBe("poi");
  });

  it("POI 가 없으면 null", () => {
    const results = [{ types: ["country", "political"], place_id: "c" }] as google.maps.GeocoderResult[];
    expect(pickGeocoderPoiPlaceId(results)).toBeNull();
  });
});
