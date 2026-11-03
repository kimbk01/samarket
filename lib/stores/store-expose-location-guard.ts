import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

/**
 * 노출 켜기 안전장치 — 배달을 켠 매장은 지도 좌표가 있어야 손님 배달 목록(배달 범위
 * `store_delivery_coverage`)에 들어간다. 좌표 없이 노출하면 사장님 화면은 「공개」인데 손님 목록에는
 * 0건이 된다 (실기 2026-11-03 D1: 노출 15:10 · 좌표 16:06 · 배달 범위 16:08).
 * 관리자 `set_store_visible`·사장님 매장 관리 노출 켜기가 같은 판정을 쓴다. 순수 함수.
 */
export const STORE_LOCATION_REQUIRED_FOR_VISIBILITY_ERROR = "store_location_required";

export function storeMissingDeliveryLocation(row: {
  delivery_available?: unknown;
  lat?: unknown;
  lng?: unknown;
}): boolean {
  if (row.delivery_available !== true) return false;
  return parseFiniteLatitude(row.lat) == null || parseFiniteLongitude(row.lng) == null;
}

/**
 * 노출 켜기 안전장치 2 — 매장 업종(`store_category_id`)이 있어야 손님 배달 목록에 들어간다.
 * 배달 메뉴 페이지는 지정 매장도 업종별 목록 안에서만 가져온다(`delivery-menu-compute.ts` categoryIds →
 * `browse/route.ts` 업종별 browseCore). 업종 없는 매장은 노출·지정 메뉴·배달 범위가 있어도 0건
 * (실기 2회차 2026-11-03 P3 · 운영 노출 매장 105곳은 모두 업종 있음).
 */
export const STORE_CATEGORY_REQUIRED_FOR_VISIBILITY_ERROR = "store_category_required";

export function storeMissingCategory(row: { store_category_id?: unknown }): boolean {
  return typeof row.store_category_id !== "string" || row.store_category_id.trim() === "";
}

/** 공개 매장이 손님 배달 목록에 안 나오는 이유 1개 — 헤더 칩·매장 관리 안내가 같은 판정 */
export type StoreListingBlocker = "location" | "category" | null;

export function resolveStoreListingBlocker(row: {
  delivery_available?: unknown;
  lat?: unknown;
  lng?: unknown;
  store_category_id?: unknown;
}): StoreListingBlocker {
  if (storeMissingDeliveryLocation(row)) return "location";
  if (storeMissingCategory(row)) return "category";
  return null;
}
