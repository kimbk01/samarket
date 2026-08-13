import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { GOOGLE_MAPS_ADDRESS_LANGUAGE } from "@/lib/map/google-maps-address-locale";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";
import { searchNearbyAsLegacyPlaceResults } from "@/lib/map/places-new-api";

export type ReverseGeocodePhResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  /** Geocoder 가 주는 place_id — 없으면 API 저장 불가이므로 호출부에서 처리 */
  placeId: string | null;
  parsed: ReturnType<typeof parsePhFromGooglePlaceResult>;
  /** 핀 근처 건물·상호(표시용). 저장 헤드라인은 `parsed.buildingOrPlaceHeadline` */
  buildingOrPlaceNames: string[];
};

function looksLikeStreetOnlyHeadline(name: string | null | undefined, routeLine: string | null): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  if (routeLine && n.toLowerCase() === routeLine.toLowerCase()) return true;
  if (/^\d+[A-Za-z]?\s/.test(n) && /\b(street|st\.|road|rd\.|avenue|ave\.|blvd|drive|dr\.)\b/i.test(n)) {
    return true;
  }
  return false;
}

/**
 * 핀 이동 등 좌표 기준으로 주소·구성 필드를 채운다. `parsePhFromGooglePlaceResult` 는
 * `PlaceResult` 형을 기대하므로 Geocoder 결과를 얇게 맞춘다.
 * 근처 Places 로 건물명·상호를 보강한다.
 */
export async function reverseGeocodeLatLngPh(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodePhResult | null> {
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  const resp = await geocoder.geocode({
    location: { lat: latitude, lng: longitude },
    language: GOOGLE_MAPS_ADDRESS_LANGUAGE,
  });
  const r = resp.results?.[0];
  if (!r?.formatted_address) return null;
  const formatted = r.formatted_address.trim();
  const placeId =
    typeof (r as { place_id?: string }).place_id === "string"
      ? (r as { place_id: string }).place_id.trim() || null
      : null;
  const head = formatted.split(",")[0]?.trim() ?? "";
  const fakePlace = {
    formatted_address: formatted,
    address_components: r.address_components,
    name: head,
  } as google.maps.places.PlaceResult;
  let parsed = parsePhFromGooglePlaceResult(fakePlace);

  let buildingOrPlaceNames: string[] = [];
  try {
    const nearby = await searchNearbyAsLegacyPlaceResults(
      { lat: latitude, lng: longitude },
      60,
      {
        includedTypes: ["establishment", "point_of_interest", "premise", "store"],
      },
    );
    const names: string[] = [];
    for (const pl of nearby) {
      const n = (pl.name ?? "").trim();
      if (!n) continue;
      if (names.some((x) => x.toLowerCase() === n.toLowerCase())) continue;
      names.push(n);
      if (names.length >= 4) break;
    }
    buildingOrPlaceNames = names;
    if (
      names[0] &&
      looksLikeStreetOnlyHeadline(parsed.buildingOrPlaceHeadline, parsed.routeLine)
    ) {
      parsed = {
        ...parsed,
        buildingOrPlaceHeadline: names[0],
      };
    } else if (!parsed.buildingOrPlaceHeadline && names[0]) {
      parsed = {
        ...parsed,
        buildingOrPlaceHeadline: names[0],
      };
    }
  } catch {
    /* nearby optional */
  }

  return {
    latitude,
    longitude,
    formattedAddress: formatted,
    placeId,
    parsed,
    buildingOrPlaceNames,
  };
}
