/**
 * GET /api/me/profile — dev-safe 전용 짧은 메모리 캐시 (TTL 8s, userId 키).
 * Production / 일반 dev 에서는 사용하지 않는다.
 */
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import type { ProfileRow } from "@/lib/profile/types";

const TTL_MS = 8_000;
const cache = new Map<string, { expiresAt: number; profile: ProfileRow | null }>();

export function peekMeProfileGetRouteCache(userId: string): ProfileRow | null | undefined {
  if (!isDevSafeMode()) return undefined;
  const k = userId.trim();
  if (!k) return undefined;
  const row = cache.get(k);
  const now = Date.now();
  if (!row || row.expiresAt <= now) {
    if (row) cache.delete(k);
    return undefined;
  }
  return row.profile;
}

export function setMeProfileGetRouteCache(userId: string, profile: ProfileRow | null): void {
  if (!isDevSafeMode()) return;
  const k = userId.trim();
  if (!k) return;
  cache.set(k, { expiresAt: Date.now() + TTL_MS, profile });
}

export function clearMeProfileGetRouteCache(userId: string): void {
  if (!isDevSafeMode()) return;
  const k = userId.trim();
  if (!k) return;
  cache.delete(k);
}
