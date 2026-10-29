/**
 * 배달 메뉴 구성 + 노출 매장 — 인스턴스 메모리 캐시 (목록 API 메뉴 페이지 판정용, 20s).
 * 관리자 변경은 `purgeAllStorePublicServerMemoryCaches` 로 비운다 (인스턴스 공통 세대 동기화).
 * next/cache 를 import 하지 않는 순수 모듈.
 */
export const DELIVERY_MENU_SERVER_CACHE_TTL_MS = 20_000;

type Entry<T> = { at: number; value: T };

let entry: Entry<unknown> | null = null;

export function peekDeliveryMenuServerCache<T>(nowMs: number = Date.now()): T | null {
  if (!entry) return null;
  if (nowMs - entry.at > DELIVERY_MENU_SERVER_CACHE_TTL_MS) {
    entry = null;
    return null;
  }
  return entry.value as T;
}

export function setDeliveryMenuServerCache<T>(value: T, nowMs: number = Date.now()): void {
  entry = { at: nowMs, value };
}

export function clearDeliveryMenuServerCache(): void {
  entry = null;
}
