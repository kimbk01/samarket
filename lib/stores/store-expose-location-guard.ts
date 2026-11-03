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
