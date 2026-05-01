import {
  buildPhFriendlyAddress,
  isSuitableEstablishmentDisplayName,
} from "@/lib/map/ph-friendly-address";
import {
  PLACE_FIELDS_DISPLAY_DETAIL,
  fetchPlaceDetailsAsLegacyPlaceResult,
  searchNearbyAsLegacyPlaceResults,
} from "@/lib/map/places-new-api";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";

/** 근처 POI 후보 — `establishment` 만이 아닌 상점·시설 유형 포함 */
const NEARBY_POI_TYPES = new Set([
  "establishment",
  "point_of_interest",
  "place_of_worship",
  "church",
  "mosque",
  "synagogue",
  "hindu_temple",
  "tourist_attraction",
  "store",
  "shopping_mall",
  "restaurant",
  "food",
  "cafe",
  "meal_takeaway",
  "bakery",
  "supermarket",
  "convenience_store",
  "lodging",
  "gas_station",
  "car_dealer",
  "car_repair",
  "hardware_store",
  "pharmacy",
  "beauty_salon",
  "gym",
  "spa",
  "laundry",
]);

const NEARBY_RADIUS_METERS = 100;
/** 근처 POI 후보·역지오 기반 핀 보정 허용 거리(m) — 클라 보정 상한과 동일 */
export const TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS = 56;

/** 도로·지번 줄에 쓸 지오코더 결과 — 첫 번째(랜드마크 전용)와 분리 */
export function pickStreetLikeGeocoderResult(
  results: google.maps.GeocoderResult[]
): google.maps.GeocoderResult | null {
  if (!results?.length) return null;
  const preferred = ["street_address", "intersection", "route", "premise"];
  for (const t of preferred) {
    const hit = results.find((r) => r.types?.includes(t));
    if (hit) return hit;
  }
  return results[0] ?? null;
}

/** 지오코더 다중 결과 중 상호·POI에 해당하는 place_id (첫 번째와 다를 수 있음) */
export function pickGeocoderPoiPlaceId(results: google.maps.GeocoderResult[]): string | null {
  const poiTypes = [
    "establishment",
    "point_of_interest",
    "place_of_worship",
    "church",
    "mosque",
    "synagogue",
    "hindu_temple",
    "tourist_attraction",
    "store",
    "shopping_mall",
    "restaurant",
    "food",
    "cafe",
    "gas_station",
    "lodging",
  ];
  for (const r of results) {
    const pid = (r.place_id ?? "").trim();
    if (!pid) continue;
    if (r.types?.some((t) => poiTypes.includes(t))) return pid;
  }
  const premise = results.find((r) => r.types?.includes("premise"));
  const pid = (premise?.place_id ?? "").trim();
  return pid || null;
}

/** 근접 POI 여러 개일 때 거리만으로 고르면 숙소가 음식점보다 가깝게 잡히는 경우가 있어 유형 가중치 사용 */
function poiBusinessScore(types: string[] | undefined): number {
  if (!types?.length) return 0;
  let s = 0;
  for (const t of types) {
    if (["restaurant", "food", "meal_takeaway", "cafe", "bakery", "bar"].includes(t)) {
      s = Math.max(s, 120);
    } else if (["store", "shopping_mall", "convenience_store", "supermarket", "pharmacy"].includes(t)) {
      s = Math.max(s, 95);
    } else if (["place_of_worship", "church", "mosque", "synagogue", "hindu_temple", "tourist_attraction"].includes(t)) {
      s = Math.max(s, 102);
    } else if (NEARBY_POI_TYPES.has(t)) {
      s = Math.max(s, 75);
    } else if (t === "lodging") {
      s = Math.max(s, 28);
    }
  }
  return s;
}

function pickNearestPoiPlaceId(
  marker: google.maps.LatLngLiteral,
  results: google.maps.places.PlaceResult[],
  maxDistanceMeters: number
): string | null {
  const origin = new google.maps.LatLng(marker.lat, marker.lng);
  const ranked = results
    .map((place) => {
      const placeId = (place.place_id ?? "").trim();
      const location = place.geometry?.location;
      const distanceMeters = location
        ? google.maps.geometry.spherical.computeDistanceBetween(location, origin)
        : Number.MAX_SAFE_INTEGER;
      const score = poiBusinessScore(place.types);
      const isPoi = place.types?.some((t) => NEARBY_POI_TYPES.has(t)) ?? false;
      return { placeId, distanceMeters, score, isPoi };
    })
    .filter((row) => row.placeId.length > 0 && row.distanceMeters <= maxDistanceMeters)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.isPoi !== b.isPoi) return a.isPoi ? -1 : 1;
      return a.distanceMeters - b.distanceMeters;
    });
  return ranked[0]?.placeId ?? null;
}

async function geocodeAtLocation(
  geocoder: google.maps.Geocoder,
  marker: google.maps.LatLngLiteral
): Promise<{ results: google.maps.GeocoderResult[]; status: google.maps.GeocoderStatus }> {
  return new Promise((resolve) => {
    geocoder.geocode({ location: marker }, (results, status) => {
      resolve({ results: results ?? [], status });
    });
  });
}

async function placesGetDetails(placeId: string): Promise<google.maps.places.PlaceResult | null> {
  return fetchPlaceDetailsAsLegacyPlaceResult(placeId, PLACE_FIELDS_DISPLAY_DETAIL);
}

async function placesNearbyForMeetSpot(marker: google.maps.LatLngLiteral): Promise<google.maps.places.PlaceResult[]> {
  const broad = await searchNearbyAsLegacyPlaceResults(marker, NEARBY_RADIUS_METERS);
  if (broad.length) return broad;
  return searchNearbyAsLegacyPlaceResults(marker, NEARBY_RADIUS_METERS, {
    includedTypes: ["restaurant", "cafe", "store", "shopping_mall"],
  });
}

export type TradeMeetSpotDisplayResolve = {
  displayLine: string;
  /**
   * 표시 줄에 POI·상호가 반영된 경우에만 — 지도 클릭에 `IconMouseEvent.placeId` 가 없을 때
   * 역지오/근처검색으로 잡은 place_id 로 핀을 `getDetails(geometry)` 에 맞추기 위한 힌트.
   */
  suggestedAnchorPlaceId?: string;
};

/**
 * 거래 희망 장소 핀 좌표 → 표시 주소 문자열.
 * - 도로·행정 줄은 지오코더의 **도로형** 결과에서만 뽑고,
 * - 상호·건물명은 **근접 Places POI**와 지오코더 다중 결과의 **POI place_id**를 우선해 보강한다.
 */
export async function resolveTradeMeetSpotDisplayLine(
  marker: google.maps.LatLngLiteral,
  isStale: () => boolean
): Promise<TradeMeetSpotDisplayResolve> {
  if (isStale()) return { displayLine: "" };
  await loadGoogleMaps();

  const geocoder = new google.maps.Geocoder();

  const { results: geoResults, status: geoStatus } = await geocodeAtLocation(geocoder, marker);
  if (isStale()) return { displayLine: "" };
  if (geoStatus !== "OK" || !geoResults.length) return { displayLine: "" };

  const streetResult = pickStreetLikeGeocoderResult(geoResults);
  if (!streetResult) return { displayLine: "" };
  const streetComponents = streetResult.address_components ?? [];

  const [nearbyList, poiGeoPlaceId] = await Promise.all([
    placesNearbyForMeetSpot(marker),
    Promise.resolve(pickGeocoderPoiPlaceId(geoResults)),
  ]);
  if (isStale()) return { displayLine: "" };

  const nearbyPlaceId = pickNearestPoiPlaceId(marker, nearbyList, TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS);
  const nearbyHit = nearbyList.find((p) => (p.place_id ?? "").trim() === nearbyPlaceId) ?? null;

  const [detailsNearby, detailsPoiGeo] = await Promise.all([
    nearbyPlaceId ? placesGetDetails(nearbyPlaceId) : Promise.resolve(null),
    poiGeoPlaceId && poiGeoPlaceId !== nearbyPlaceId
      ? placesGetDetails(poiGeoPlaceId)
      : Promise.resolve(null),
  ]);

  if (isStale()) return { displayLine: "" };

  let placeName: string | null = null;
  let suggestedAnchorPlaceId: string | undefined;

  const tryNameFromDetails = (d: google.maps.places.PlaceResult | null, anchorPid: string | null | undefined) => {
    const n = d?.name?.trim();
    if (!n || !isSuitableEstablishmentDisplayName(n, streetComponents)) return false;
    placeName = n;
    const id = anchorPid?.trim();
    if (id) suggestedAnchorPlaceId = id;
    return true;
  };

  if (!tryNameFromDetails(detailsNearby, nearbyPlaceId)) {
    tryNameFromDetails(detailsPoiGeo, poiGeoPlaceId);
  }
  /** 상세(`getDetails`) 간헐 실패 시에도 근접검색 결과의 상호를 사용 */
  if (!placeName) {
    const inline = nearbyHit?.name?.trim();
    if (inline && isSuitableEstablishmentDisplayName(inline, streetComponents)) {
      placeName = inline;
      const id = nearbyPlaceId?.trim();
      if (id) suggestedAnchorPlaceId = id;
    }
  }

  const displayLine = buildPhFriendlyAddress({
    components: streetComponents,
    placeName,
  }).trim();

  return {
    displayLine,
    ...(suggestedAnchorPlaceId ? { suggestedAnchorPlaceId } : {}),
  };
}
