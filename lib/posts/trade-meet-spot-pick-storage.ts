import type { TradeMeetSpotValue } from "@/lib/posts/trade-meet-spot-types";

const PICK_RESULT_KEY = "samarket:tradeMeetSpotPickResult:v1";
const PICK_DRAFT_KEY = "samarket:tradeMeetSpotPickDraft:v1";

export type TradeMeetSpotPickDraft = {
  lat: number;
  lng: number;
  displayLine: string;
  addressTouched: boolean;
};

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** 글쓰기 → 지도로 이동 직전: 이미 확정한 희망 장소가 있으면 핀·주소 초기값으로 저장. 없으면 기존 지도 초안은 유지(뒤로가기 후 재입장). */
export function seedTradeMeetSpotDraftForNavigation(current: TradeMeetSpotValue | null | undefined): void {
  if (typeof window === "undefined") return;
  if (!current) return;
  if (!isFiniteNum(current.lat) || !isFiniteNum(current.lng)) return;
  const line = typeof current.displayLine === "string" ? current.displayLine.trim() : "";
  try {
    window.sessionStorage.setItem(
      PICK_DRAFT_KEY,
      JSON.stringify({
        lat: current.lat,
        lng: current.lng,
        displayLine: line,
        addressTouched: line.length > 0,
      } satisfies TradeMeetSpotPickDraft)
    );
  } catch {
    /* quota */
  }
}

export function getTradeMeetSpotPickDraft(): TradeMeetSpotPickDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PICK_DRAFT_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<TradeMeetSpotPickDraft>;
    if (!isFiniteNum(j.lat) || !isFiniteNum(j.lng)) return null;
    const displayLine = typeof j.displayLine === "string" ? j.displayLine : "";
    const addressTouched = typeof j.addressTouched === "boolean" ? j.addressTouched : false;
    return { lat: j.lat, lng: j.lng, displayLine, addressTouched };
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
    const lat = typeof j.lat === "number" && Number.isFinite(j.lat) ? j.lat : undefined;
    const lng = typeof j.lng === "number" && Number.isFinite(j.lng) ? j.lng : undefined;
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
