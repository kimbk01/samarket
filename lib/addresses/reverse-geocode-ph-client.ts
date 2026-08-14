import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { GOOGLE_MAPS_ADDRESS_LANGUAGE } from "@/lib/map/google-maps-address-locale";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";
import {
  isSuitableEstablishmentDisplayName,
  pickNearestEstablishmentByDistance,
} from "@/lib/map/ph-friendly-address";
import {
  PLACE_FIELDS_DISPLAY_DETAIL,
  fetchPlaceDetailsAsLegacyPlaceResult,
  searchNearbyAsLegacyPlaceResults,
} from "@/lib/map/places-new-api";
import {
  TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS,
  pickGeocoderPoiPlaceId,
  pickStreetLikeGeocoderResult,
} from "@/lib/map/resolve-trade-meet-spot-display-line";

export type ReverseGeocodePhResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  /** Geocoder / 근접 POI place_id — 없으면 API 저장 불가이므로 호출부에서 처리 */
  placeId: string | null;
  parsed: ReturnType<typeof parsePhFromGooglePlaceResult>;
};

const NEARBY_RADIUS_METERS = 100;

async function resolveNearbyEstablishmentName(
  marker: google.maps.LatLngLiteral,
  streetComponents: google.maps.GeocoderAddressComponent[],
  geoResults: google.maps.GeocoderResult[]
): Promise<{ name: string | null; placeId: string | null }> {
  const poiGeoPlaceId = pickGeocoderPoiPlaceId(geoResults);

  let nearbyList = await searchNearbyAsLegacyPlaceResults(marker, NEARBY_RADIUS_METERS);
  if (!nearbyList.length) {
    nearbyList = await searchNearbyAsLegacyPlaceResults(marker, NEARBY_RADIUS_METERS, {
      includedTypes: ["restaurant", "cafe", "store", "shopping_mall"],
    });
  }

  const nearest = pickNearestEstablishmentByDistance(marker, nearbyList);
  const nearbyPlaceId =
    nearest && nearest.distanceMeters <= TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS
      ? nearest.placeId
      : null;

  const [detailsNearby, detailsPoiGeo] = await Promise.all([
    nearbyPlaceId ? fetchPlaceDetailsAsLegacyPlaceResult(nearbyPlaceId, PLACE_FIELDS_DISPLAY_DETAIL) : null,
    poiGeoPlaceId && poiGeoPlaceId !== nearbyPlaceId
      ? fetchPlaceDetailsAsLegacyPlaceResult(poiGeoPlaceId, PLACE_FIELDS_DISPLAY_DETAIL)
      : null,
  ]);

  const tryName = (
    d: google.maps.places.PlaceResult | null,
    pid: string | null
  ): { name: string; placeId: string } | null => {
    const n = d?.name?.trim() ?? "";
    if (!n || !isSuitableEstablishmentDisplayName(n, streetComponents)) return null;
    const id = (d?.place_id ?? pid)?.trim() || null;
    if (!id) return null;
    return { name: n, placeId: id };
  };

  const fromNearby = tryName(detailsNearby, nearbyPlaceId);
  if (fromNearby) return fromNearby;

  const fromGeoPoi = tryName(detailsPoiGeo, poiGeoPlaceId);
  if (fromGeoPoi) return fromGeoPoi;

  const inline = nearbyList.find((p) => (p.place_id ?? "").trim() === nearbyPlaceId);
  const inlineName = inline?.name?.trim() ?? "";
  if (
    inlineName &&
    nearbyPlaceId &&
    isSuitableEstablishmentDisplayName(inlineName, streetComponents)
  ) {
    return { name: inlineName, placeId: nearbyPlaceId };
  }

  return { name: null, placeId: null };
}

/**
 * 핀 이동 등 좌표 기준으로 주소·구성 필드를 채운다.
 * 도로·행정은 Geocoder, 상호·건물명은 거래 희망장소와 같이 Nearby + Place Details 로 보강한다.
 * (예전처럼 formatted_address 첫 조각을 name 으로 가짜 넣지 않는다.)
 */
export async function reverseGeocodeLatLngPh(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodePhResult | null> {
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  const marker = { lat: latitude, lng: longitude };
  const resp = await geocoder.geocode({
    location: marker,
    language: GOOGLE_MAPS_ADDRESS_LANGUAGE,
  });
  const geoResults = resp.results ?? [];
  const streetResult = pickStreetLikeGeocoderResult(geoResults) ?? geoResults[0];
  if (!streetResult?.formatted_address) return null;

  const formatted = streetResult.formatted_address.trim();
  const streetComponents = streetResult.address_components ?? [];
  const streetPlaceId =
    typeof streetResult.place_id === "string" ? streetResult.place_id.trim() || null : null;

  const establishment = await resolveNearbyEstablishmentName(marker, streetComponents, geoResults);

  const placeForParse = {
    formatted_address: formatted,
    address_components: streetComponents,
    /** 도로명을 building 으로 쓰지 않음 — 적합한 POI name 만 */
    name: establishment.name ?? undefined,
  } as google.maps.places.PlaceResult;

  const parsed = parsePhFromGooglePlaceResult(placeForParse);
  const placeId = establishment.placeId || streetPlaceId;

  return {
    latitude,
    longitude,
    formattedAddress: formatted,
    placeId,
    parsed,
  };
}
