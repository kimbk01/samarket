import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let loadPromise: Promise<void> | null = null;

/** Maps JavaScript API — `maps` + `places` + `geocoding` (역지오코딩) */
export function loadGoogleMaps(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 가 없습니다."));
  }
  if (!loadPromise) {
    setOptions({ key, v: "weekly" });
    loadPromise = (async () => {
      await importLibrary("maps");
      await importLibrary("places");
      await importLibrary("geocoding");
    })();
  }
  return loadPromise;
}
