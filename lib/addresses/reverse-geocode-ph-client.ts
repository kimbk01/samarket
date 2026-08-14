import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { GOOGLE_MAPS_ADDRESS_LANGUAGE } from "@/lib/map/google-maps-address-locale";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";
import {
  buildPhFriendlyAddress,
  isSuitableEstablishmentDisplayName,
} from "@/lib/map/ph-friendly-address";
import {
  PLACE_FIELDS_DISPLAY_DETAIL,
  fetchPlaceDetailsAsLegacyPlaceResult,
  searchNearbyAsLegacyPlaceResults,
} from "@/lib/map/places-new-api";
import {
  TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS,
  pickGeocoderPoiPlaceId,
  pickNearestPoiPlaceId,
  pickStreetLikeGeocoderResult,
  stripLeadingPlusCodeFromFormatted,
} from "@/lib/map/resolve-trade-meet-spot-display-line";

export type ReverseGeocodePhResult = {
  latitude: number;
  longitude: number;
  /** 저장·표시용 — Plus Code 제거 + 짧은 도로/지역 줄 (건물명은 parsed 쪽) */
  formattedAddress: string;
  /** Geocoder / 근접 POI place_id — 없으면 API 저장 불가이므로 호출부에서 처리 */
  placeId: string | null;
  parsed: ReturnType<typeof parsePhFromGooglePlaceResult>;
};

export type ReverseGeocodePhOptions = {
  /** 검색으로 고른 place — 핀이 아직 근처면 이 상호 유지 (작은 매장 Nearby로 덮지 않음) */
  preferPlaceId?: string | null;
  preferBuildingName?: string | null;
};

const NEARBY_RADIUS_METERS = 100;
/** 몰 부지·검색 장소 유지 반경 (핀이 몰 가장자리에 있어도 검색명 유지) */
const PREFER_PLACE_MAX_METERS = 120;

async function tryPreferredEstablishment(
  marker: google.maps.LatLngLiteral,
  streetComponents: google.maps.GeocoderAddressComponent[],
  preferPlaceId: string | null | undefined,
  preferBuildingName: string | null | undefined
): Promise<{ name: string; placeId: string } | null> {
  const pid = (preferPlaceId ?? "").trim();
  if (!pid) return null;
  const d = await fetchPlaceDetailsAsLegacyPlaceResult(pid, PLACE_FIELDS_DISPLAY_DETAIL);
  const loc = d?.geometry?.location;
  if (!loc) return null;
  const dist = google.maps.geometry.spherical.computeDistanceBetween(
    loc,
    new google.maps.LatLng(marker.lat, marker.lng)
  );
  if (dist > PREFER_PLACE_MAX_METERS) return null;
  const n = (d?.name?.trim() || (preferBuildingName ?? "").trim() || "").trim();
  if (!n || !isSuitableEstablishmentDisplayName(n, streetComponents)) return null;
  return { name: n, placeId: (d?.place_id ?? pid).trim() };
}

async function resolveNearbyEstablishmentName(
  marker: google.maps.LatLngLiteral,
  streetComponents: google.maps.GeocoderAddressComponent[],
  geoResults: google.maps.GeocoderResult[]
): Promise<{ name: string | null; placeId: string | null }> {
  const poiGeoPlaceId = pickGeocoderPoiPlaceId(geoResults);

  let nearbyList = await searchNearbyAsLegacyPlaceResults(marker, NEARBY_RADIUS_METERS);
  if (!nearbyList.length) {
    nearbyList = await searchNearbyAsLegacyPlaceResults(marker, NEARBY_RADIUS_METERS, {
      includedTypes: ["shopping_mall", "restaurant", "cafe", "store"],
    });
  }

  const nearbyPlaceId = pickNearestPoiPlaceId(
    marker,
    nearbyList,
    TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS
  );

  const [detailsNearby, detailsPoiGeo] = await Promise.all([
    nearbyPlaceId ? fetchPlaceDetailsAsLegacyPlaceResult(nearbyPlaceId, PLACE_FIELDS_DISPLAY_DETAIL) : null,
    poiGeoPlaceId && poiGeoPlaceId !== nearbyPlaceId
      ? fetchPlaceDetailsAsLegacyPlaceResult(poiGeoPlaceId, PLACE_FIELDS_DISPLAY_DETAIL)
      : null,
  ]);

  const tryName = (
    d: google.maps.places.PlaceResult | null,
    candidatePid: string | null
  ): { name: string; placeId: string } | null => {
    const n = d?.name?.trim() ?? "";
    if (!n || !isSuitableEstablishmentDisplayName(n, streetComponents)) return null;
    const id = (d?.place_id ?? candidatePid)?.trim() || null;
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

function shortStreetFormatted(
  streetComponents: google.maps.GeocoderAddressComponent[],
  fallbackFormatted: string
): string {
  const friendly = buildPhFriendlyAddress({
    components: streetComponents,
    placeName: null,
  })
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
  if (friendly) return friendly;
  return stripLeadingPlusCodeFromFormatted(fallbackFormatted);
}

/**
 * 핀 이동 등 좌표 기준으로 주소·구성 필드를 채운다.
 * - 도로·행정: Geocoder (Plus Code 지양)
 * - 상호·건물: 검색 place 유지 → 아니면 거래와 동일 Nearby 가중(몰 우선)
 * - formattedAddress: 짧은 도로+지역 (건물명은 parsed.buildingOrPlaceHeadline)
 */
export async function reverseGeocodeLatLngPh(
  latitude: number,
  longitude: number,
  opts?: ReverseGeocodePhOptions
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

  const rawFormatted = streetResult.formatted_address.trim();
  const streetComponents = streetResult.address_components ?? [];
  const streetPlaceId =
    typeof streetResult.place_id === "string" ? streetResult.place_id.trim() || null : null;

  const preferred = await tryPreferredEstablishment(
    marker,
    streetComponents,
    opts?.preferPlaceId,
    opts?.preferBuildingName
  );
  const establishment =
    preferred ?? (await resolveNearbyEstablishmentName(marker, streetComponents, geoResults));

  const placeForParse = {
    formatted_address: rawFormatted,
    address_components: streetComponents,
    name: establishment.name ?? undefined,
  } as google.maps.places.PlaceResult;

  const parsed = parsePhFromGooglePlaceResult(placeForParse);
  const placeId = establishment.placeId || streetPlaceId;
  const formattedAddress = shortStreetFormatted(streetComponents, rawFormatted);

  return {
    latitude,
    longitude,
    formattedAddress,
    placeId,
    parsed,
  };
}
