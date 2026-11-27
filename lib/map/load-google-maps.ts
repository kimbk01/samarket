import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import {
  GOOGLE_MAPS_ADDRESS_LANGUAGE,
  GOOGLE_MAPS_ADDRESS_REGION,
} from "@/lib/map/google-maps-address-locale";

let loadPromise: Promise<void> | null = null;

/** 지도 키 없음 — `Error.message` 는 코드만. 화면은 `t("addr_ui_maps_load_failed")` (재감사 2026-11-27) */
export const GOOGLE_MAPS_API_KEY_MISSING = "google_maps_api_key_missing";

/** Maps JavaScript API — `maps` + `marker`(Advanced Marker) + `places` + `geocoding` + `geometry` */
export function loadGoogleMaps(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    console.error("[loadGoogleMaps] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY missing");
    return Promise.reject(new Error(GOOGLE_MAPS_API_KEY_MISSING));
  }
  if (!loadPromise) {
    /** 초기 스크립트에 places 등을 함께 올려 레거시 PlacesService·Geocoder·Map 초기화 경합을 줄인다 */
    setOptions({
      key,
      v: "weekly",
      language: GOOGLE_MAPS_ADDRESS_LANGUAGE,
      region: GOOGLE_MAPS_ADDRESS_REGION,
      libraries: ["marker", "places", "geocoding", "geometry"],
    });
    loadPromise = (async () => {
      await importLibrary("maps");
      await importLibrary("marker");
      await importLibrary("places");
      await importLibrary("geocoding");
      await importLibrary("geometry");
    })().catch((e: unknown) => {
      /** 실패한 promise 를 캐시하지 않는다 — 재시도 시 다시 로드 */
      loadPromise = null;
      throw e;
    });
  }
  return loadPromise;
}
