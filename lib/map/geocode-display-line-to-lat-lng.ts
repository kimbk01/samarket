import { loadGoogleMaps } from "@/lib/map/load-google-maps";

/**
 * 저장된 `display_line`만 있고 좌표가 없을 때 — 수정 후 지도 재진입 시 핀 복원용 (Google Geocoder).
 */
export async function geocodeDisplayLineToLatLng(addressLine: string): Promise<{ lat: number; lng: number } | null> {
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
  const loc = results?.[0]?.geometry?.location;
  if (!loc) return null;
  const lat = loc.lat();
  const lng = loc.lng();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
