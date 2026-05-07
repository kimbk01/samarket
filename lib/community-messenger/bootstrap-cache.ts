import type { CommunityMessengerBootstrap, CommunityMessengerBootstrapCritical } from "@/lib/community-messenger/types";

const TTL_MS = 5 * 60 * 1000;
const SS_KEY_FULL = "samarket.messenger.bootstrap.v1";
const SS_KEY_CRITICAL = "samarket.messenger.bootstrap.critical.v1";
/** lite 네트워크 단축과 동일 페이로드 형태 — 별도 TTL 로 세션 복원 우선순위 조정 가능 */
const SS_KEY_MINIMAL = "samarket.messenger.bootstrap.minimal.v1";

let memoryFullCache: { data: CommunityMessengerBootstrap; at: number } | null = null;
let memoryCriticalCache: { data: CommunityMessengerBootstrapCritical; at: number } | null = null;
let memoryMinimalCache: { data: CommunityMessengerBootstrap; at: number } | null = null;

function readSessionFull(): CommunityMessengerBootstrap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY_FULL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: CommunityMessengerBootstrap };
    if (!parsed.data) return null;
    memoryFullCache = { data: parsed.data, at: parsed.at };
    return parsed.data;
  } catch {
    return null;
  }
}

function readSessionCritical(): CommunityMessengerBootstrapCritical | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY_CRITICAL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: CommunityMessengerBootstrapCritical };
    if (!parsed?.data || parsed.data.tier !== "critical") return null;
    memoryCriticalCache = { data: parsed.data, at: parsed.at };
    return parsed.data;
  } catch {
    return null;
  }
}

function readSessionMinimal(): CommunityMessengerBootstrap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY_MINIMAL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: CommunityMessengerBootstrap };
    if (!parsed.data) return null;
    memoryMinimalCache = { data: parsed.data, at: parsed.at };
    return parsed.data;
  } catch {
    return null;
  }
}

/** SPA 재진입·새로고침 직후 첫 페인트용 full 부트스트랩(stale 포함 — SWR 즉시 렌더). */
export function peekMessengerBootstrapFull(): CommunityMessengerBootstrap | null {
  if (memoryFullCache) {
    return memoryFullCache.data;
  }
  return readSessionFull();
}

/** critical 전용 스냅샷 — full 없이도 목록 즉시 표시용 */
export function peekMessengerBootstrapCritical(): CommunityMessengerBootstrapCritical | null {
  if (memoryCriticalCache) {
    return memoryCriticalCache.data;
  }
  return readSessionCritical();
}

/** deferred lite 응답 캐시(형태는 full 과 동일). */
export function peekMessengerBootstrapMinimal(): CommunityMessengerBootstrap | null {
  if (memoryMinimalCache) {
    return memoryMinimalCache.data;
  }
  return readSessionMinimal();
}

/** @deprecated peekMessengerBootstrapFull 와 동일 — 호환 유지 */
export function peekBootstrapCache(): CommunityMessengerBootstrap | null {
  return peekMessengerBootstrapFull();
}

export function isBootstrapCacheFresh(): boolean {
  if (memoryFullCache) return Date.now() - memoryFullCache.at <= TTL_MS;
  return false;
}

export function isCriticalBootstrapCacheFresh(): boolean {
  if (memoryCriticalCache) return Date.now() - memoryCriticalCache.at <= TTL_MS;
  return false;
}

export function primeMessengerBootstrapFull(data: CommunityMessengerBootstrap) {
  const tiered = { ...data, clientHydrationTier: "full" as const };
  memoryFullCache = { data: tiered, at: Date.now() };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_FULL, JSON.stringify({ at: Date.now(), data: tiered }));
  } catch {
    // ignore quota / private mode
  }
}

export function primeMessengerBootstrapCritical(data: CommunityMessengerBootstrapCritical) {
  memoryCriticalCache = { data, at: Date.now() };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_CRITICAL, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore
  }
}

export function primeMessengerBootstrapMinimal(data: CommunityMessengerBootstrap) {
  memoryMinimalCache = { data, at: Date.now() };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY_MINIMAL, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore
  }
}

/** @deprecated primeMessengerBootstrapFull 와 동일 */
export function primeBootstrapCache(data: CommunityMessengerBootstrap) {
  primeMessengerBootstrapFull(data);
}

export function clearBootstrapCache() {
  memoryFullCache = null;
  memoryCriticalCache = null;
  memoryMinimalCache = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SS_KEY_FULL);
    sessionStorage.removeItem(SS_KEY_CRITICAL);
    sessionStorage.removeItem(SS_KEY_MINIMAL);
  } catch {
    // ignore
  }
}
