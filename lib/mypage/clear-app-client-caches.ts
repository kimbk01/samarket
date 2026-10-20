"use client";

import { clearBrowserCacheStorageBestEffort } from "@/lib/auth/invalidate-auth-exit-client-caches";
import {
  isClearableLocalStorageKey,
  isClearableSessionStorageKey,
} from "@/lib/mypage/client-cache-key-registry";

/**
 * 내정보 「캐시 삭제」 — 다시 받을 수 있는 임시 데이터만 지운다 (D16 · 최종 설계 S17).
 * 지우는 키는 `client-cache-key-registry` 에 등록된 것만 — 레지스트리에 없는 키는 그대로 둔다.
 * (이전: 세션 저장소 전체 삭제로 거래 글쓰기 초안·주소 흐름·세션 로그인 캐시까지 지워짐 → 금지)
 */
export function isClearableLocalCacheKey(key: string): boolean {
  return isClearableLocalStorageKey(key);
}

function removeMatching(storage: Storage, match: (key: string) => boolean): number {
  const remove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && match(key)) remove.push(key);
  }
  remove.forEach((k) => storage.removeItem(k));
  return remove.length;
}

export async function clearAppClientCaches(): Promise<{ localKeys: number; sessionKeys: number }> {
  let localKeys = 0;
  let sessionKeys = 0;
  try {
    localKeys = removeMatching(localStorage, isClearableLocalStorageKey);
  } catch {
    /* private mode */
  }
  try {
    sessionKeys = removeMatching(sessionStorage, isClearableSessionStorageKey);
  } catch {
    /* private mode */
  }
  await clearBrowserCacheStorageBestEffort();
  return { localKeys, sessionKeys };
}
