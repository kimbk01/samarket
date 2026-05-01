import {
  coerceTradeMeetSpotLatLng,
  type TradeMeetSpotValue,
} from "@/lib/posts/trade-meet-spot-types";

const PICK_RESULT_KEY = "samarket:tradeMeetSpotPickResult:v1";
const PICK_DRAFT_KEY = "samarket:tradeMeetSpotPickDraft:v1";
/** 좌표 없이 저장된 `display_line`만 있을 때 — 지도에서 한 번 지오코딩해 핀 복원 */
const GEOCODE_HINT_KEY = "samarket:tradeMeetSpotGeocodeHint:v1";

export type TradeMeetSpotGeocodeHint = {
  displayLine: string;
};

export type TradeMeetSpotPickDraft = {
  lat: number;
  lng: number;
  displayLine: string;
  addressTouched: boolean;
  /** POI·상호 선택 시 — 재입장 시 `lat`/`lng` 오차가 있어도 Places geometry 로 핀 정합 */
  placeId?: string;
};

/** meta·JSON·세션에서 위경도가 문자열로 올 수 있음 — `typeof === "number"` 만 보면 시드가 통째로 스킵되어 지도가 대표 주소로만 열림 */
function coordsFromTradeMeetSpot(
  current: TradeMeetSpotValue | null | undefined
): { lat: number; lng: number } | null {
  if (!current) return null;
  const lat = coerceTradeMeetSpotLatLng(current.lat as unknown);
  const lng = coerceTradeMeetSpotLatLng(current.lng as unknown);
  if (lat === undefined || lng === undefined) return null;
  return { lat, lng };
}

/** 글쓰기 → 지도로 이동 직전: 이미 확정한 희망 장소가 있으면 핀·주소 초기값으로 저장. 없으면 기존 지도 초안은 유지(뒤로가기 후 재입장). */
export function seedTradeMeetSpotDraftForNavigation(current: TradeMeetSpotValue | null | undefined): void {
  if (typeof window === "undefined") return;
  if (!current) return;
  const coords = coordsFromTradeMeetSpot(current);
  if (!coords) return;
  const line = typeof current.displayLine === "string" ? current.displayLine.trim() : "";
  const placeId = typeof current.placeId === "string" && current.placeId.trim() ? current.placeId.trim() : undefined;
  try {
    clearTradeMeetSpotGeocodeHint();
    window.sessionStorage.setItem(
      PICK_DRAFT_KEY,
      JSON.stringify({
        lat: coords.lat,
        lng: coords.lng,
        displayLine: line,
        addressTouched: line.length > 0,
        ...(placeId ? { placeId } : {}),
      } satisfies TradeMeetSpotPickDraft)
    );
  } catch {
    /* quota */
  }
}

export function setTradeMeetSpotGeocodeHint(hint: TradeMeetSpotGeocodeHint): void {
  if (typeof window === "undefined") return;
  const line = hint.displayLine.trim();
  if (!line) return;
  try {
    window.sessionStorage.setItem(GEOCODE_HINT_KEY, JSON.stringify({ displayLine: line } satisfies TradeMeetSpotGeocodeHint));
  } catch {
    /* quota */
  }
}

export function getTradeMeetSpotGeocodeHint(): TradeMeetSpotGeocodeHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GEOCODE_HINT_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<TradeMeetSpotGeocodeHint>;
    const displayLine = typeof j.displayLine === "string" ? j.displayLine.trim() : "";
    if (!displayLine) return null;
    return { displayLine };
  } catch {
    return null;
  }
}

export function clearTradeMeetSpotGeocodeHint(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(GEOCODE_HINT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 지도 페이지 진입 직전 — 좌표 있으면 드래프트 시드, `display_line` 만 있으면 지오코딩 힌트,
 * 둘 다 없으면 드래프트·힌트 제거(신규 글 → 주소록 대표로 핀).
 */
export function prepareTradeMeetSpotMapNavigation(current: TradeMeetSpotValue | null | undefined): void {
  if (typeof window === "undefined") return;
  if (coordsFromTradeMeetSpot(current)) {
    seedTradeMeetSpotDraftForNavigation(current);
    return;
  }
  clearTradeMeetSpotPickDraft();
  const line = typeof current?.displayLine === "string" ? current.displayLine.trim() : "";
  if (line) {
    setTradeMeetSpotGeocodeHint({ displayLine: line });
  } else {
    clearTradeMeetSpotGeocodeHint();
  }
}

export function clearTradeMeetSpotSessionNavigationState(): void {
  clearTradeMeetSpotPickDraft();
  clearTradeMeetSpotGeocodeHint();
}

export function getTradeMeetSpotPickDraft(): TradeMeetSpotPickDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PICK_DRAFT_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<TradeMeetSpotPickDraft>;
    const lat = coerceTradeMeetSpotLatLng(j.lat);
    const lng = coerceTradeMeetSpotLatLng(j.lng);
    if (lat === undefined || lng === undefined) return null;
    const displayLine = typeof j.displayLine === "string" ? j.displayLine : "";
    const addressTouched = typeof j.addressTouched === "boolean" ? j.addressTouched : false;
    const placeId = typeof j.placeId === "string" && j.placeId.trim() ? j.placeId.trim() : undefined;
    return { lat, lng, displayLine, addressTouched, ...(placeId ? { placeId } : {}) };
  } catch {
    return null;
  }
}

export function setTradeMeetSpotPickDraft(draft: TradeMeetSpotPickDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PICK_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota */
  }
}

export function clearTradeMeetSpotPickDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PICK_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function parsePickResultJson(raw: string): TradeMeetSpotValue | null {
  try {
    const j = JSON.parse(raw) as Partial<TradeMeetSpotValue>;
    const displayLine = typeof j.displayLine === "string" ? j.displayLine.trim() : "";
    if (!displayLine) return null;
    const lat = coerceTradeMeetSpotLatLng(j.lat);
    const lng = coerceTradeMeetSpotLatLng(j.lng);
    const placeId = typeof j.placeId === "string" && j.placeId.trim() ? j.placeId.trim() : undefined;
    return { displayLine, lat, lng, placeId };
  } catch {
    return null;
  }
}

/** 위치 선택 화면에서 확인 후 → 글쓰기로 돌아올 때 1회 반영 */
export function setTradeMeetSpotPickResult(value: TradeMeetSpotValue): void {
  if (typeof window === "undefined") return;
  try {
    clearTradeMeetSpotPickDraft();
    clearTradeMeetSpotGeocodeHint();
    window.sessionStorage.setItem(PICK_RESULT_KEY, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

/** 제거 없이 읽기 — 복귀 직후 폼 리마운트 레이스 완화 */
export function peekTradeMeetSpotPickResult(): TradeMeetSpotValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PICK_RESULT_KEY);
    if (!raw) return null;
    return parsePickResultJson(raw);
  } catch {
    return null;
  }
}

/** 결과 키 수동 제거 */
export function clearTradeMeetSpotPickResult(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PICK_RESULT_KEY);
  } catch {
    /* ignore */
  }
}

/** 읽고 키 제거(1회 소비) */
export function consumeTradeMeetSpotPickResult(): TradeMeetSpotValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PICK_RESULT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PICK_RESULT_KEY);
    return parsePickResultJson(raw);
  } catch {
    return null;
  }
}
