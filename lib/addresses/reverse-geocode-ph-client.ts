import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { GOOGLE_MAPS_ADDRESS_LANGUAGE } from "@/lib/map/google-maps-address-locale";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";

export type ReverseGeocodePhResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  /** Geocoder 가 주는 place_id — 없으면 API 저장 불가이므로 호출부에서 처리 */
  placeId: string | null;
  parsed: ReturnType<typeof parsePhFromGooglePlaceResult>;
};

/**
 * 핀 이동 등 좌표 기준으로 주소·구성 필드를 채운다. `parsePhFromGooglePlaceResult` 는
 * `PlaceResult` 형을 기대하므로 Geocoder 결과를 얇게 맞춘다.
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
  const parsed = parsePhFromGooglePlaceResult(fakePlace);
  return {
    latitude,
    longitude,
    formattedAddress: formatted,
    placeId,
    parsed,
  };
}
