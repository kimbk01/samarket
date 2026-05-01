/**
 * Maps JavaScript API — **레거시** `google.maps.places.PlacesService`
 * (`nearbySearch`, `getDetails`). 새 Places RPC(`places.googleapis.com/$rpc/...`)는 사용하지 않음.
 *
 * 호출부 호환을 위해 파일명·대부분의 export 이름은 유지한다.
 */

import { loadGoogleMaps } from "@/lib/map/load-google-maps";

/** getDetails 필드 힌트 — 레거시 `fields` 로 매핑한다 */
export const PLACE_FIELDS_DISPLAY_DETAIL = [
  "displayName",
  "addressComponents",
  "formattedAddress",
  "id",
] as const;

export const PLACE_FIELDS_LOCATION = ["location", "id"] as const;

export const PLACE_FIELDS_POI_FULL = [
  "displayName",
  "addressComponents",
  "formattedAddress",
  "location",
  "types",
  "primaryType",
  "id",
] as const;

let placesServiceHost: HTMLDivElement | null = null;
let placesServiceSingleton: google.maps.places.PlacesService | null = null;

/**
 * Maps JS·places 라이브러리 로드 후에만 호출한다.
 * 문서 밖 분리 노드는 일부 환경에서 Map 초기화와 충돌하거나 Attribution 요구를 만족하지 못할 수 있어 `body`에 숨김 노드로 붙인다.
 */
function getPlacesService(): google.maps.places.PlacesService {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PlacesService는 브라우저에서만 사용할 수 있습니다.");
  }
  const PlacesCtor = google.maps?.places?.PlacesService;
  if (typeof PlacesCtor !== "function") {
    throw new Error(
      "google.maps.places.PlacesService 를 찾을 수 없습니다. Places 라이브러리가 로드되었는지 확인하세요."
    );
  }
  if (!placesServiceSingleton) {
    try {
      const host = document.createElement("div");
      host.setAttribute("data-samarket-places-attribution-host", "");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText =
        "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden";
      (document.body ?? document.documentElement).appendChild(host);
      placesServiceHost = host;
      placesServiceSingleton = new PlacesCtor(host);
    } catch (e) {
      placesServiceHost?.remove();
      placesServiceHost = null;
      placesServiceSingleton = null;
      throw e;
    }
  }
  return placesServiceSingleton;
}

/** 새 Places 필드 식별자 → 레거시 Place Details `fields` 배열 */
function newStyleFieldsToLegacyGetDetailsFields(fieldIds: readonly string[]): string[] {
  const set = new Set<string>();
  for (const f of fieldIds) {
    switch (f) {
      case "displayName":
        set.add("name");
        break;
      case "addressComponents":
        set.add("address_components");
        break;
      case "formattedAddress":
        set.add("formatted_address");
        break;
      case "id":
        set.add("place_id");
        break;
      case "location":
        set.add("geometry");
        break;
      case "types":
        set.add("types");
        break;
      case "primaryType":
        set.add("types");
        break;
      default:
        break;
    }
  }
  if (!set.has("place_id")) set.add("place_id");
  return [...set];
}

function nearbySearchOnce(
  service: google.maps.places.PlacesService,
  request: google.maps.places.PlaceSearchRequest
): Promise<google.maps.places.PlaceResult[]> {
  return new Promise((resolve) => {
    service.nearbySearch(request, (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
        resolve([]);
        return;
      }
      resolve(results);
    });
  });
}

function mergePlaceResultsDedupe(lists: google.maps.places.PlaceResult[]): google.maps.places.PlaceResult[] {
  const byId = new Map<string, google.maps.places.PlaceResult>();
  for (const pl of lists) {
    const id = (pl.place_id ?? "").trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, pl);
  }
  return [...byId.values()];
}

/**
 * Place ID 상세 — `PlacesService#getDetails`
 */
export async function fetchPlaceDetailsAsLegacyPlaceResult(
  placeId: string,
  fieldIds: readonly string[]
): Promise<google.maps.places.PlaceResult | null> {
  const id = placeId.trim();
  if (!id) return null;
  await loadGoogleMaps();
  const fields = newStyleFieldsToLegacyGetDetailsFields(fieldIds);
  const service = getPlacesService();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(90 + attempt * 70);
    const place = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
      service.getDetails({ placeId: id, fields }, (result, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && result) {
          resolve(result);
          return;
        }
        resolve(null);
      });
    });
    if (place) return place;
  }
  return null;
}

/**
 * 근처 검색 — `PlacesService#nearbySearch` (타입별 요청은 레거시 제약상 순차 호출 후 병합)
 */
export async function searchNearbyAsLegacyPlaceResults(
  marker: google.maps.LatLngLiteral,
  radiusMeters: number,
  opts?: { includedTypes?: string[] }
): Promise<google.maps.places.PlaceResult[]> {
  await loadGoogleMaps();
  const service = getPlacesService();
  const center = new google.maps.LatLng(marker.lat, marker.lng);
  const baseRequest: google.maps.places.PlaceSearchRequest = {
    location: center,
    radius: radiusMeters,
  };

  const searchMultiTypes = async (types: string[]): Promise<google.maps.places.PlaceResult[]> => {
    const merged: google.maps.places.PlaceResult[] = [];
    for (const t of types) {
      const part = await nearbySearchOnce(service, { ...baseRequest, type: t });
      merged.push(...part);
    }
    return mergePlaceResultsDedupe(merged);
  };

  let raw: google.maps.places.PlaceResult[] = [];

  if (opts?.includedTypes?.length) {
    raw = await searchMultiTypes(opts.includedTypes);
    if (!raw.length) {
      raw = await nearbySearchOnce(service, baseRequest);
    }
  } else {
    raw = await nearbySearchOnce(service, baseRequest);
  }

  if (!raw.length) {
    raw = await searchMultiTypes([
      "restaurant",
      "cafe",
      "store",
      "shopping_mall",
      "church",
      "tourist_attraction",
    ]);
  }

  return raw;
}
