/**
 * Maps JavaScript API — 새 Places 라이브러리(`importLibrary("places")`)만 사용.
 * 레거시 `google.maps.places.PlacesService` 제거; 필요 시 {@link google.maps.places.PlaceResult} 형태로만 맞춤.
 *
 * @see https://developers.google.com/maps/documentation/javascript/places-migration-overview
 */

import { loadGoogleMaps } from "@/lib/map/load-google-maps";

/** getDetails name + address_components 대체 */
export const PLACE_FIELDS_DISPLAY_DETAIL = [
  "displayName",
  "addressComponents",
  "formattedAddress",
  "id",
] as const;

/** 지오메트리만 */
export const PLACE_FIELDS_LOCATION = ["location", "id"] as const;

/** POI 클릭 / 표시줄 */
export const PLACE_FIELDS_POI_FULL = [
  "displayName",
  "addressComponents",
  "formattedAddress",
  "location",
  "types",
  "primaryType",
  "id",
] as const;

function mapPlacesAddressToGeocoder(
  comps?: google.maps.places.AddressComponent[] | null
): google.maps.GeocoderAddressComponent[] {
  if (!comps?.length) return [];
  return comps.map((c) => ({
    long_name: c.longText ?? "",
    short_name: c.shortText ?? "",
    types: c.types ?? [],
  }));
}

/** 새 Place → 레거시 PlaceResult (기존 빌드·점수 로직 호환) */
export function newPlaceToLegacyPlaceResult(place: google.maps.places.Place): google.maps.places.PlaceResult {
  const types: string[] = [...(place.types ?? [])];
  const pt = place.primaryType?.trim();
  if (pt && !types.includes(pt)) types.push(pt);

  return {
    place_id: place.id,
    name: place.displayName ?? undefined,
    formatted_address: place.formattedAddress ?? undefined,
    geometry: place.location ? { location: place.location } : undefined,
    types: types.length ? types : undefined,
    address_components: mapPlacesAddressToGeocoder(place.addressComponents),
  };
}

/**
 * Place ID로 상세 조회 — 레거시 `PlacesService#getDetails` 대체.
 */
export async function fetchPlaceDetailsAsLegacyPlaceResult(
  placeId: string,
  fieldIds: readonly string[]
): Promise<google.maps.places.PlaceResult | null> {
  const id = placeId.trim();
  if (!id) return null;
  await loadGoogleMaps();
  const PlaceCtor = google.maps.places.Place;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(90 + attempt * 70);
    try {
      const place = new PlaceCtor({ id });
      await place.fetchFields({ fields: [...fieldIds] });
      return newPlaceToLegacyPlaceResult(place);
    } catch {
      /* retry */
    }
  }
  return null;
}

/**
 * 근처 검색 — 레거시 `PlacesService#nearbySearch` 대체.
 */
export async function searchNearbyAsLegacyPlaceResults(
  marker: google.maps.LatLngLiteral,
  radiusMeters: number,
  opts?: { includedTypes?: string[] }
): Promise<google.maps.places.PlaceResult[]> {
  await loadGoogleMaps();
  const PlaceCtor = google.maps.places.Place;
  const RankPref = google.maps.places.SearchNearbyRankPreference;
  const fields = [
    "id",
    "location",
    "displayName",
    "types",
    "primaryType",
    "addressComponents",
    "formattedAddress",
  ];

  const baseReq: google.maps.places.SearchNearbyRequest = {
    fields,
    locationRestriction: { center: marker, radius: radiusMeters },
    maxResultCount: 20,
    rankPreference: RankPref.DISTANCE,
  };

  const run = async (includedTypes?: string[]): Promise<google.maps.places.Place[]> => {
    const req: google.maps.places.SearchNearbyRequest = includedTypes?.length
      ? { ...baseReq, includedTypes }
      : baseReq;
    try {
      const { places } = await PlaceCtor.searchNearby(req);
      return places ?? [];
    } catch {
      return [];
    }
  };

  let raw = await run(opts?.includedTypes);
  if (!raw.length && opts?.includedTypes?.length) {
    raw = await run(undefined);
  }
  /** 예전 `type: establishment` 단일 폴백 — 새 Table B 유형 다중 */
  if (!raw.length) {
    raw = await run(["restaurant", "cafe", "store", "shopping_mall", "church", "tourist_attraction"]);
  }
  return raw.map(newPlaceToLegacyPlaceResult);
}
