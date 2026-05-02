import { loadGoogleMaps } from "@/lib/map/load-google-maps";

export type PlacePredictionRow = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

const MAX = 8;

/**
 * 필리핀 우선 — Places Autocomplete 예측(제목·부제 구조화 포함).
 */
export async function fetchPlacePredictionsPh(input: string): Promise<PlacePredictionRow[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  await loadGoogleMaps();
  const AutocompleteServiceCtor = google.maps.places.AutocompleteService;
  if (typeof AutocompleteServiceCtor !== "function") {
    return [];
  }

  const service = new AutocompleteServiceCtor();

  return new Promise((resolve) => {
    service.getPlacePredictions(
      {
        input: q,
        componentRestrictions: { country: "ph" },
      },
      (predictions, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
          resolve([]);
          return;
        }
        resolve(
          predictions.slice(0, MAX).map((p) => {
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
          }).filter((row) => row.placeId.length > 0)
        );
      }
    );
  });
}
