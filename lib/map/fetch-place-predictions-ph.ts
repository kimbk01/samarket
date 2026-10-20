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

const MAX = 8;

export type PlacePredictionsResult =
  | { ok: true; rows: PlacePredictionRow[] }
  | { ok: false; reason: "maps_unavailable" | "status"; status?: string };

type PlacesStatusShape = { OK: string; ZERO_RESULTS: string };

/**
 * Places Autocomplete 상태 → 결과 구분 (S08). `OK`·`ZERO_RESULTS` 만 정상, 그 외(`REQUEST_DENIED`·
 * `OVER_QUERY_LIMIT`·`UNKNOWN_ERROR` 등)는 오류 — 빈 결과와 구분한다.
 */
export function classifyPlacePredictionsStatus(
  status: string,
  statuses: PlacesStatusShape,
): "ok" | "zero" | "error" {
  if (status === statuses.OK) return "ok";
  if (status === statuses.ZERO_RESULTS) return "zero";
  return "error";
}

function mapPredictions(predictions: google.maps.places.AutocompletePrediction[]): PlacePredictionRow[] {
  return predictions
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
    .filter((row) => row.placeId.length > 0);
}

/**
 * 필리핀 우선 — Places Autocomplete 예측(제목·부제 구조화 포함), 오류와 0건을 구분해 돌려준다(S08).
 * 지도 로드 실패·예외 → `{ ok:false, reason:"maps_unavailable" }`.
 */
export async function fetchPlacePredictionsPhResult(input: string): Promise<PlacePredictionsResult> {
  const q = input.trim();
  if (q.length < 2) return { ok: true, rows: [] };

  try {
    await loadGoogleMaps();
  } catch {
    return { ok: false, reason: "maps_unavailable" };
  }
  const AutocompleteServiceCtor = google.maps.places?.AutocompleteService;
  if (typeof AutocompleteServiceCtor !== "function") {
    return { ok: false, reason: "maps_unavailable" };
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
        const kind = classifyPlacePredictionsStatus(
          String(status),
          google.maps.places.PlacesServiceStatus as unknown as PlacesStatusShape,
        );
        if (kind === "error") {
          resolve({ ok: false, reason: "status", status: String(status) });
          return;
        }
        if (kind === "zero" || !predictions?.length) {
          resolve({ ok: true, rows: [] });
          return;
        }
        resolve({ ok: true, rows: mapPredictions(predictions) });
      },
    );
  });
}

/**
 * 필리핀 우선 — Places Autocomplete 예측(제목·부제 구조화 포함).
 * 기존 소비자(거래 약속 장소·관리자·지도 검색) 호환: 오류도 빈 배열(동작 불변). 내정보 주소 검색은 `…Result` 사용.
 */
export async function fetchPlacePredictionsPh(input: string): Promise<PlacePredictionRow[]> {
  const r = await fetchPlacePredictionsPhResult(input);
  return r.ok ? r.rows : [];
}
