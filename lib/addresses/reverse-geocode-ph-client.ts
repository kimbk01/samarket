import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { GOOGLE_MAPS_ADDRESS_LANGUAGE } from "@/lib/map/google-maps-address-locale";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import {
  buildPhFriendlyAddress,
  isSuitableEstablishmentDisplayName,
} from "@/lib/map/ph-friendly-address";
import {
  PLACE_FIELDS_POI_FULL,
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

/** PLACE identity vs ADDRESS geocode — street place_id 와 POI place_id 를 섞지 않음 */
export type ReverseGeocodeIdentitySource =
  | "preferred"
  | "geocoder_poi"
  | "nearby"
  | "street_only";

export type ReverseGeocodePhResult = {
  latitude: number;
  longitude: number;
  /** 국가명 제외 PH 도로+지역 (건물명은 parsed 쪽) */
  formattedAddress: string;
  /**
   * Place/POI identity place_id.
   * street_only 일 때만 Geocoder street place_id (저장용).
   * preferred/geocoder_poi/nearby 는 establishment identity.
   */
  placeId: string | null;
  parsed: ReturnType<typeof parsePhFromGooglePlaceResult>;
  identitySource: ReverseGeocodeIdentitySource;
  /** 동일 Place 내 핀 보정 — 상세주소(unit) 유지 여부 */
  samePlaceAsPreferred: boolean;
};

export type ReverseGeocodePhOptions = {
  preferPlaceId?: string | null;
  preferBuildingName?: string | null;
};

const NEARBY_SEARCH_RADIUS_METERS = 100;

/** 일반 POI 동일-장소 허용 (centroid↔입구) */
const SAME_PLACE_METERS_DEFAULT = 120;
/** 몰·캠퍼스·병원·콘도 등 대형 — 18m magic 금지 */
const SAME_PLACE_METERS_LARGE = 450;

const LARGE_PLACE_TYPES = new Set([
  "shopping_mall",
  "hospital",
  "university",
  "school",
  "lodging",
  "premise",
  "tourist_attraction",
  "stadium",
  "museum",
  "park",
  "airport",
  "bus_station",
  "train_station",
  "subway_station",
]);

type DesignatedPlace = {
  name: string;
  placeId: string;
  source: Exclude<ReverseGeocodeIdentitySource, "street_only">;
};

export function samePlaceToleranceMeters(types: string[] | undefined): number {
  if (!types?.length) return SAME_PLACE_METERS_DEFAULT;
  if (types.some((t) => LARGE_PLACE_TYPES.has(t))) return SAME_PLACE_METERS_LARGE;
  return SAME_PLACE_METERS_DEFAULT;
}

/** preferred Place geometry 기준 동일 장소 여부 (viewport 우선, 없으면 type-aware 거리) */
export function isPinWithinPreferredPlace(
  marker: google.maps.LatLngLiteral,
  place: google.maps.places.PlaceResult
): boolean {
  const loc = place.geometry?.location;
  if (!loc) return false;
  const pin = new google.maps.LatLng(marker.lat, marker.lng);
  const viewport = place.geometry?.viewport;
  if (viewport && typeof viewport.contains === "function" && viewport.contains(pin)) {
    return true;
  }
  const dist = google.maps.geometry.spherical.computeDistanceBetween(loc, pin);
  return dist <= samePlaceToleranceMeters(place.types);
}

function tryDetailsAsDesignated(
  d: google.maps.places.PlaceResult | null,
  fallbackPid: string | null,
  streetComponents: google.maps.GeocoderAddressComponent[],
  source: DesignatedPlace["source"]
): DesignatedPlace | null {
  const n = d?.name?.trim() ?? "";
  if (!n || !isSuitableEstablishmentDisplayName(n, streetComponents)) return null;
  const id = (d?.place_id ?? fallbackPid)?.trim() || null;
  if (!id) return null;
  return { name: n, placeId: id, source };
}

/**
 * 사용자 검색 선택 Place — PIN fine-tune 최우선 identity.
 * Details 에 geometry 필수 (없으면 prefer 폐기되던 ROOT CAUSE).
 */
async function tryPreferredEstablishment(
  marker: google.maps.LatLngLiteral,
  streetComponents: google.maps.GeocoderAddressComponent[],
  preferPlaceId: string | null | undefined,
  preferBuildingName: string | null | undefined
): Promise<DesignatedPlace | null> {
  const pid = (preferPlaceId ?? "").trim();
  if (!pid) return null;

  const d = await fetchPlaceDetailsAsLegacyPlaceResult(pid, PLACE_FIELDS_POI_FULL);
  if (!d?.geometry?.location) return null;
  if (!isPinWithinPreferredPlace(marker, d)) return null;

  const fromDetails = tryDetailsAsDesignated(d, pid, streetComponents, "preferred");
  if (fromDetails) return fromDetails;

  const fallbackName = (preferBuildingName ?? "").trim();
  if (!fallbackName || !isSuitableEstablishmentDisplayName(fallbackName, streetComponents)) {
    return null;
  }
  return { name: fallbackName, placeId: pid, source: "preferred" };
}

/**
 * preferred 가 없을 때만 — Geocoder POI → Nearby(거래와 동일 가중, 18m sole authority 금지).
 * street Geocoder place_id 를 POI identity 로 승격하지 않음.
 */
async function resolveNewPlaceIdentity(
  marker: google.maps.LatLngLiteral,
  streetComponents: google.maps.GeocoderAddressComponent[],
  geoResults: google.maps.GeocoderResult[]
): Promise<DesignatedPlace | null> {
  const poiGeoPlaceId = pickGeocoderPoiPlaceId(geoResults);
  if (poiGeoPlaceId) {
    const d = await fetchPlaceDetailsAsLegacyPlaceResult(poiGeoPlaceId, PLACE_FIELDS_POI_FULL);
    const hit = tryDetailsAsDesignated(d, poiGeoPlaceId, streetComponents, "geocoder_poi");
    if (hit) return hit;
  }

  let nearbyList = await searchNearbyAsLegacyPlaceResults(marker, NEARBY_SEARCH_RADIUS_METERS);
  if (!nearbyList.length) {
    nearbyList = await searchNearbyAsLegacyPlaceResults(marker, NEARBY_SEARCH_RADIUS_METERS, {
      includedTypes: ["shopping_mall", "store", "premise", "lodging"],
    });
  }

  /** 18m magic 제거 — 거래 meet-spot 상한 + 대형 타입 가중(pickNearestPoiPlaceId) */
  const nearbyPlaceId = pickNearestPoiPlaceId(
    marker,
    nearbyList,
    Math.max(TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS, SAME_PLACE_METERS_DEFAULT)
  );
  if (!nearbyPlaceId) return null;

  const d = await fetchPlaceDetailsAsLegacyPlaceResult(nearbyPlaceId, PLACE_FIELDS_POI_FULL);
  const fromDetails = tryDetailsAsDesignated(d, nearbyPlaceId, streetComponents, "nearby");
  if (fromDetails) return fromDetails;

  const inline = nearbyList.find((p) => (p.place_id ?? "").trim() === nearbyPlaceId);
  const inlineName = inline?.name?.trim() ?? "";
  if (inlineName && isSuitableEstablishmentDisplayName(inlineName, streetComponents)) {
    return { name: inlineName, placeId: nearbyPlaceId, source: "nearby" };
  }
  return null;
}

function phStreetAreaLine(
  components: google.maps.GeocoderAddressComponent[],
  fallbackFormatted: string
): string {
  const friendly = buildPhFriendlyAddress({
    components,
    placeName: null,
  })
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
  const base = friendly || stripLeadingPlusCodeFromFormatted(fallbackFormatted);
  return stripCountryFromAddressDisplayLine(base, "Philippines").trim() || base;
}

/**
 * PIN → 주소 draft.
 * CONTRACT: PLACE IDENTITY ≠ PIN POSITION ≠ STREET GEOCODE identity
 * - preferred(검색 선택)가 동일 장소면 identity 유지, lat/lng만 새 핀
 * - 이탈 시에만 새 POI resolve (tenant가 parent/선택 Place를 덮지 않음 — preferred 우선)
 * - Geocoder street 는 도로/지역 줄 전용
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

  const designated =
    preferred ?? (await resolveNewPlaceIdentity(marker, streetComponents, geoResults));

  const placeForParse = {
    formatted_address: rawFormatted,
    address_components: streetComponents,
    name: designated?.name ?? undefined,
  } as google.maps.places.PlaceResult;

  const parsed = parsePhFromGooglePlaceResult(placeForParse);
  const identitySource: ReverseGeocodeIdentitySource = designated?.source ?? "street_only";
  const placeId = designated?.placeId || streetPlaceId;
  const formattedAddress = phStreetAreaLine(streetComponents, rawFormatted);
  const samePlaceAsPreferred = identitySource === "preferred";

  return {
    latitude,
    longitude,
    formattedAddress,
    placeId,
    parsed,
    identitySource,
    samePlaceAsPreferred,
  };
}
