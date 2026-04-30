import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

const TTL_MS = 5 * 60 * 1000;
const SS_KEY = "samarket.messenger.bootstrap.v1";

let memoryCache: { data: CommunityMessengerBootstrap; at: number } | null = null;

function readSession(): CommunityMessengerBootstrap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: CommunityMessengerBootstrap };
    if (!parsed.data) return null;
    memoryCache = { data: parsed.data, at: parsed.at };
    return parsed.data;
  } catch {
    return null;
  }
}

/** SPA 재진입·새로고침 직후 첫 페인트용(stale 포함 — SWR 즉시 렌더). */
export function peekBootstrapCache(): CommunityMessengerBootstrap | null {
  if (memoryCache) {
    return memoryCache.data;
  }
  return readSession();
}

export function isBootstrapCacheFresh(): boolean {
  if (memoryCache) return Date.now() - memoryCache.at <= TTL_MS;
  return false;
}

export function primeBootstrapCache(data: CommunityMessengerBootstrap) {
  memoryCache = { data, at: Date.now() };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore quota / private mode
  }
}

export function clearBootstrapCache() {
  memoryCache = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SS_KEY);
  } catch {
    // ignore
  }
}
