import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import {
  GOOGLE_MAPS_ADDRESS_LANGUAGE,
  GOOGLE_MAPS_ADDRESS_REGION,
} from "@/lib/map/google-maps-address-locale";

export type PlacePredictionRow = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type PlacePredictionsPhResult = {
  rows: PlacePredictionRow[];
  /** google.maps.places.PlacesServiceStatus 문자열 */
  status: string;
};

const MAX = 8;

/**
 * 필리핀 우선 — Places Autocomplete 예측(제목·부제 구조화 포함).
 * 실패·빈 결과는 status 로 호출부가 UI에 표시한다 (침묵 금지 — Xiaomi/WebView 디버그).
 */
export async function fetchPlacePredictionsPhDetailed(
  input: string,
): Promise<PlacePredictionsPhResult> {
  const q = input.trim();
  if (q.length < 2) return { rows: [], status: "SHORT_INPUT" };

  await loadGoogleMaps();
  const AutocompleteServiceCtor = google.maps.places.AutocompleteService;
  if (typeof AutocompleteServiceCtor !== "function") {
    return { rows: [], status: "AUTOCOMPLETE_UNAVAILABLE" };
  }

  const service = new AutocompleteServiceCtor();

  return new Promise((resolve) => {
    service.getPlacePredictions(
      {
        input: q,
        componentRestrictions: { country: "ph" },
        language: GOOGLE_MAPS_ADDRESS_LANGUAGE,
        region: GOOGLE_MAPS_ADDRESS_REGION,
      },
      (predictions, status) => {
        const statusText = String(status ?? "UNKNOWN");
        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
          resolve({ rows: [], status: statusText });
          return;
        }
        resolve({
          status: statusText,
          rows: predictions
            .slice(0, MAX)
            .map((p) => {
              const sf = p.structured_formatting;
              const mainText = (sf?.main_text ?? p.description ?? "").trim();
              const secondaryText = (sf?.secondary_text ?? "").trim();
              const pid = (p.place_id ?? "").trim();
              const description = (p.description ?? "").trim();
              return {
                placeId: pid,
                description: description || mainText,
                mainText: mainText || description,
                secondaryText,
              };
            })
            .filter((row) => row.placeId.length > 0),
        });
      },
    );
  });
}

export async function fetchPlacePredictionsPh(input: string): Promise<PlacePredictionRow[]> {
  const r = await fetchPlacePredictionsPhDetailed(input);
  return r.rows;
}
