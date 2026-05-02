import { loadGoogleMaps } from "@/lib/map/load-google-maps";

/** Google Geocoder 1건 결과 — 핀 이동·`place_id` 보존용 */
export type GeocodeDisplayLineResult = {
  lat: number;
  lng: number;
  /** 있으면 저장 시 메타에 넣기 좋음 */
  placeId?: string;
};

/**
 * 저장된 `display_line`만 있고 좌표가 없을 때 — 수정 후 지도 재진입 시 핀 복원용 (Google Geocoder).
 * 수동 입력 주소로 핀 이동할 때도 동일 함수 사용.
 */
export async function geocodeDisplayLineToLatLng(addressLine: string): Promise<GeocodeDisplayLineResult | null> {
  const line = addressLine.trim();
  if (!line) return null;
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  const tryGeocode = (request: google.maps.GeocoderRequest): Promise<google.maps.GeocoderResult[] | null> =>
    new Promise((resolve) => {
      geocoder.geocode(request, (results, status) => {
        if (status !== google.maps.GeocoderStatus.OK || !results?.length) {
          resolve(null);
          return;
        }
        resolve(results);
      });
    });

  let results = await tryGeocode({ address: line, componentRestrictions: { country: "ph" } });
  if (!results) {
    results = await tryGeocode({ address: line });
  }
  const first = results?.[0];
  const loc = first?.geometry?.location;
  if (!loc) return null;
  const lat = loc.lat();
  const lng = loc.lng();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const pid = typeof first.place_id === "string" && first.place_id.trim() ? first.place_id.trim() : undefined;
  return { lat, lng, ...(pid ? { placeId: pid } : {}) };
}
