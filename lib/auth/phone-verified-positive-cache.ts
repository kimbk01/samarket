import type { ProfileRow } from "@/lib/profile/types";

/** 인증 완료 사용자만 캐시 — 미인증은 캐시하지 않아 검증 직후 즉시 반영 가능 */
export const PHONE_VERIFIED_POSITIVE_CACHE_TTL_MS = 45_000;

type PhoneVerifiedPositiveEntry = {
  profile: ProfileRow;
  expiresAt: number;
};

type PhoneVerifiedPositiveCacheGlobal = {
  __samarketPhoneVerifiedPositiveCache?: Map<string, PhoneVerifiedPositiveEntry>;
};

function cacheMap(): Map<string, PhoneVerifiedPositiveEntry> {
  const g = globalThis as PhoneVerifiedPositiveCacheGlobal;
  if (!g.__samarketPhoneVerifiedPositiveCache) {
    g.__samarketPhoneVerifiedPositiveCache = new Map();
  }
  return g.__samarketPhoneVerifiedPositiveCache;
}

export function peekPhoneVerifiedPositiveProfile(userId: string): ProfileRow | null {
  const uid = userId.trim();
  if (!uid) return null;
  const hit = cacheMap().get(uid);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) cacheMap().delete(uid);
    return null;
  }
  return hit.profile;
}

export function rememberPhoneVerifiedPositiveProfile(userId: string, profile: ProfileRow): void {
  const uid = userId.trim();
  if (!uid) return;
  cacheMap().set(uid, { profile, expiresAt: Date.now() + PHONE_VERIFIED_POSITIVE_CACHE_TTL_MS });
  while (cacheMap().size > 2_000) {
    const k = cacheMap().keys().next().value;
    if (k === undefined) break;
    cacheMap().delete(k);
  }
}

export function invalidatePhoneVerifiedPositiveProfile(userId: string): void {
  const uid = userId.trim();
  if (!uid) return;
  cacheMap().delete(uid);
}
