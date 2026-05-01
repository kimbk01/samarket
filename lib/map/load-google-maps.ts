import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let loadPromise: Promise<void> | null = null;

/** Maps JavaScript API — `maps` + `marker`(Advanced Marker) + `places` + `geocoding` + `geometry` */
export function loadGoogleMaps(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 가 없습니다."));
  }
  if (!loadPromise) {
    /** 초기 스크립트에 places 등을 함께 올려 레거시 PlacesService·Geocoder·Map 초기화 경합을 줄인다 */
    setOptions({
      key,
      v: "weekly",
      libraries: ["marker", "places", "geocoding", "geometry"],
    });
    loadPromise = (async () => {
      await importLibrary("maps");
      await importLibrary("marker");
      await importLibrary("places");
      await importLibrary("geocoding");
      await importLibrary("geometry");
    })();
  }
  return loadPromise;
}
