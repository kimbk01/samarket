"use client";

import { DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX } from "@/lib/permissions/device-permission-session-prefix";
import { clearBrowserCacheStorageBestEffort } from "@/lib/auth/invalidate-auth-exit-client-caches";

/**
 * 내정보 「캐시 삭제」 — 다시 받을 수 있는 임시 데이터만 지운다 (D16).
 * 지우는 것: 브라우저 Cache Storage(이미지·인트로 등 런타임 캐시) · 세션 임시 저장(sessionStorage) ·
 *           목록 캐시(localStorage 키 이름에 `cache` 가 들어간 samarket/dibay/kasama 키, 구 `cache_`/`temp_` 키).
 * 지우지 않는 것: 로그인 세션·동의·언어 등 기기 설정, 기기 권한 안내 상태.
 */
const CACHE_KEY_RE = /^(?:(?:samarket|dibay|kasama)[:._-].*cache|cache_|temp_)/i;

export function isClearableLocalCacheKey(key: string): boolean {
  return CACHE_KEY_RE.test(key);
}

export async function clearAppClientCaches(): Promise<{ localKeys: number }> {
  let localKeys = 0;
  try {
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isClearableLocalCacheKey(key)) remove.push(key);
    }
    remove.forEach((k) => localStorage.removeItem(k));
    localKeys = remove.length;
  } catch {
    /* private mode */
  }
  try {
    const keep: Array<[string, string]> = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX)) {
        keep.push([key, sessionStorage.getItem(key) ?? ""]);
      }
    }
    sessionStorage.clear();
    for (const [k, v] of keep) sessionStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
  await clearBrowserCacheStorageBestEffort();
  return { localKeys };
}
