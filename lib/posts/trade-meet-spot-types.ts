/** 거래 글 `meta.trade_meet_spot` 및 위치 선택 플로우 */

export type TradeMeetSpotValue = {
  /** 지도·역지오코딩 또는 사용자 정리 한 줄 */
  displayLine: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

/**
 * 수정 시 저장된 핀을 지도에 그대로 쓰려면 lat/lng 가 필요함.
 * JSON/JSONB 를 거치면 숫자가 문자열로 올 수 있어, 숫자만 인정하던 코드에서는 좌표가 빠지고
 * 지도가 주소록 대표 위치로 열리는 문제가 생김 (신규 글 기준 ①과 충돌).
 */
export function coerceTradeMeetSpotLatLng(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** `meta.trade_meet_spot` → 폼 상태 (수정 시 ③: 저장된 희망 장소 유지) */
export function tradeMeetSpotFromMetaSnapshot(ts: unknown): TradeMeetSpotValue | null {
  if (!ts || typeof ts !== "object") return null;
  const o = ts as Record<string, unknown>;
  const dl = String(o.display_line ?? "").trim();
  if (!dl) return null;
  const lat = coerceTradeMeetSpotLatLng(o.lat) ?? coerceTradeMeetSpotLatLng(o.latitude);
  const lng = coerceTradeMeetSpotLatLng(o.lng) ?? coerceTradeMeetSpotLatLng(o.longitude);
  const pid = o.place_id;
  const placeId = typeof pid === "string" && pid.trim() ? pid.trim() : undefined;
  return { displayLine: dl, lat, lng, placeId };
}

/** 글 저장 시 meta — 문자열 좌표도 숫자로 넣어 재조회·지도 시드가 깨지지 않게 함 */
export function pickPersistableMeetSpotCoords(
  spot: TradeMeetSpotValue | null | undefined
): { lat: number; lng: number } | undefined {
  const lat = coerceTradeMeetSpotLatLng(spot?.lat as unknown);
  const lng = coerceTradeMeetSpotLatLng(spot?.lng as unknown);
  if (lat === undefined || lng === undefined) return undefined;
  return { lat, lng };
}

export function tradeMeetSpotFromClientFields(
  raw:
    | {
        displayLine?: string | null;
        lat?: unknown;
        lng?: unknown;
        placeId?: string | null;
      }
    | null
    | undefined
): TradeMeetSpotValue | null {
  const dl = typeof raw?.displayLine === "string" ? raw.displayLine.trim() : "";
  if (!dl) return null;
  return {
    displayLine: dl,
    lat: coerceTradeMeetSpotLatLng(raw?.lat),
    lng: coerceTradeMeetSpotLatLng(raw?.lng),
    placeId: typeof raw?.placeId === "string" && raw.placeId.trim() ? raw.placeId.trim() : undefined,
  };
}
