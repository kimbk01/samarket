/**
 * 매장 허브 배달 탭 — 매장 1곳의 거리 정책 모드만 바꾸는 순수 병합 (DEF-58).
 * 이전: 화면이 전역 JSON 을 읽고 통째로 PUT → 다른 관리자의 다른 매장 변경을 덮어씀.
 * 이후: 서버가 최신 JSON 위에 이 매장 항목만 병합하고, updated_at 비교로 저장한다.
 */
import {
  normalizeDeliveryStoreDistanceOverrides,
  type DeliveryStoreDistanceMode,
  type DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";

export const STORE_DISTANCE_MODES = ["inherit", "enabled", "disabled"] as const;

export function isStoreDistanceMode(v: unknown): v is DeliveryStoreDistanceMode {
  return typeof v === "string" && (STORE_DISTANCE_MODES as readonly string[]).includes(v);
}

export function currentStoreDistanceMode(
  overridesJson: unknown,
  storeId: string
): DeliveryStoreDistanceMode {
  const o = normalizeDeliveryStoreDistanceOverrides(overridesJson);
  return o.stores[storeId.trim()]?.mode ?? "inherit";
}

/** 이 매장 항목만 바꾼 새 JSON. 다른 매장 항목은 그대로 둔다. maxKm 는 반경 SSOT 이전 값이라 null. */
export function mergeStoreDistanceOverride(
  overridesJson: unknown,
  storeId: string,
  mode: DeliveryStoreDistanceMode
): DeliveryStoreDistanceOverrides {
  const id = storeId.trim();
  const base = normalizeDeliveryStoreDistanceOverrides(overridesJson);
  const stores = { ...base.stores };
  if (mode === "inherit") delete stores[id];
  else stores[id] = { mode, maxKm: null };
  return { stores };
}
