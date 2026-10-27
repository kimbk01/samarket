/**
 * 거래 글 수정(TM-05): 화면이 가진 meta 필드를 비우거나 체크 해제하면 저장값도 지운다.
 *
 * - 서버 수정 병합은 `{...before.meta, ...body.meta}` 라 빠진 키는 이전 값이 남는다.
 * - 그래서 수정 요청에는 「이 스킨 폼이 쓰는 키 중 이번 값에 없는 키」를 `null` 로 보내고,
 *   서버(`mergeTradePostFromPatch`)는 `null` 키를 삭제한다.
 * - composition 이 끈 필드는 화면에 없으므로 건드리지 않는다 (같은 `filterTradePersistMetaByComposition` 판정).
 */
import { filterTradePersistMetaByComposition } from "./filter-persist-meta-by-composition";
import type { ResolvedTradeComposition } from "./types";

/** `buildTradeMeta`(TradeWriteForm) 가 스킨별로 쓰는 키 — 같은 파일과 함께 유지 */
export const TRADE_WRITE_SKIN_META_KEYS: Readonly<Record<string, readonly string[]>> = {
  "real-estate": [
    "neighborhood",
    "building_name",
    "estate_type",
    "deal_type",
    "deposit",
    "monthly",
    "management_fee",
    "has_premium",
    "size_sq",
    "room_count",
    "bathroom_count",
    "move_in_date",
  ],
  "used-car": [
    "car_trade",
    "car_body_type",
    "car_model",
    "car_year",
    "mileage",
    "has_accident",
    "transmission",
    "fuel_type",
    "car_year_max",
  ],
  "rent-car": [
    "car_model",
    "car_year",
    "transmission",
    "fuel_type",
    "deposit",
    "mileage_cap",
    "with_driver",
    "pickup_location",
    "available_from",
    "daily_price",
  ],
};

export function withClearedTradeWriteMetaKeys(
  meta: Record<string, unknown>,
  ownedKeys: readonly string[],
  composition: ResolvedTradeComposition
): Record<string, unknown> {
  const probe: Record<string, unknown> = {};
  for (const k of ownedKeys) probe[k] = true;
  const shown = Object.keys(filterTradePersistMetaByComposition(probe, composition));
  const next: Record<string, unknown> = { ...meta };
  for (const k of shown) {
    if (!(k in next)) next[k] = null;
  }
  return next;
}

/** 서버 병합: `null` 값 키는 삭제 (클라이언트가 지운 필드) */
export function mergeTradeMetaWithClears(
  before: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...before, ...patch };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
  }
  return merged;
}

/** 제한 수정 단계에서는 삭제 요청을 무시한다 (기존 값 유지 — 제한 검증과 충돌하지 않게) */
export function dropTradeMetaClears(patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== null) next[k] = v;
  return next;
}

/**
 * 구인·환전 확장 폼: 비운 값은 `undefined` 로 만들어지고 JSON 에서 빠져 이전 값이 남는다.
 * 수정 요청에서는 `undefined` → `null`(삭제), `alsoClearIfMissing` 키가 없으면 `null` 로 보낸다.
 */
export function withExplicitTradeMetaClears(
  meta: Record<string, unknown>,
  alsoClearIfMissing: readonly string[]
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) next[k] = v === undefined ? null : v;
  for (const k of alsoClearIfMissing) if (!(k in next)) next[k] = null;
  return next;
}
