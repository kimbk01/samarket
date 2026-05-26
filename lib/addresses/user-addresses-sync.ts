/**
 * CONTRACT — 주소 목록·대표(defaults) 클라이언트 동기화 단일 진입점.
 *
 * DO NOT: 저장/삭제/대표 지정 직후 `fetchMeAddressesListSingleFlight` 만 단독 호출하고
 *        sessionStorage·defaults 캐시·`samarket:addresses-updated` 를 각각 따로 갱신하지 말 것.
 *
 * USE:
 * - `commitUserAddressListAfterMutation()` — CRUD 직후 목록 재조회 + 캐시 + 브로드캐스트
 * - `broadcastUserAddressesChanged()` — 목록은 이미 맞을 때(타 화면) defaults·구독자만 갱신
 */

import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  isMeAddressListCacheFresh,
  refreshMeAddressesListAfterMutation,
} from "@/lib/addresses/address-list-client-cache";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";

/** defaults 스냅샷 + 전역 구독자(마이페이지·배달 헤더 등) */
export function broadcastUserAddressesChanged(): void {
  invalidateAddressDefaultsSnapshotCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SAMARKET_ADDRESSES_UPDATED_EVENT));
  }
}

/**
 * 주소 POST/PATCH/DELETE·대표 지정 직후 — stale single-flight/sessionStorage 제거 → 최신 목록 → 브로드캐스트.
 * 반환 rows 를 호출 측 `setList` 에 넣으면 목록 UI 가 즉시 맞춰진다.
 */
export async function commitUserAddressListAfterMutation(): Promise<UserAddressDTO[]> {
  const rows = await refreshMeAddressesListAfterMutation();
  broadcastUserAddressesChanged();
  return rows;
}

/** 이벤트 구독 측 — 같은 탭에서 방금 commit 한 직후 중복 fetch 방지용 */
export function shouldSkipAddressListReloadFromEvent(maxAgeMs = 2000): boolean {
  return isMeAddressListCacheFresh(maxAgeMs);
}
