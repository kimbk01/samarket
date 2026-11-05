/**
 * App Boot Layer — `GET /api/me/profile?lite=1` 단일 비행 (서버 `profileSelectMode: lite`).
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import { isGuestAuthEstablished, logGuestFetchSkipped } from "@/lib/auth/guest-auth-state";
import type { MeProfileGetResult } from "@/lib/profile/fetch-me-profile-deduped";
import { recordBootVerifyFetch } from "@/lib/app-boot/client-boot-request-journal";
import { logShellFetchTrace } from "@/lib/dibay/shell-fetch-trace";

/** Shared with `fetchMeProfileFullBackground` — wait instead of parallel lite+full. */
export const APP_BOOT_PROFILE_MINIMAL_FLIGHT = "app-boot:profile:minimal" as const;
const BOOT_MINIMAL_FLIGHT = APP_BOOT_PROFILE_MINIMAL_FLIGHT;
const BOOT_MINIMAL_TTL_MS = 4_000;
/**
 * 요청 시작부터 본문 읽기 완료까지 한 번의 마감 시간 (`ME_PROFILE_FETCH_TIMEOUT_MS` 와 동일).
 * 마감 초과는 throw — 401·비회원으로 해석하지 않고 캐시에도 쓰지 않는다
 * (throw 해야 single-flight 키가 해제되어 다음 복구가 새 요청을 보낸다).
 */
export const APP_BOOT_PROFILE_FETCH_TIMEOUT_MS = 12_000;

type AppBootProfileFetchCacheEntry = {
  expiresAt: number;
  value: MeProfileGetResult;
  /**
   * CUT-B1 — synthetic 401 from guest-gate skip (recoverable/terminal guest).
   * Must NOT open public root feed (auth restore may still succeed).
   */
  fromGuestSkip?: boolean;
};

let cached: AppBootProfileFetchCacheEntry | null = null;
let cacheEpoch = 0;
/** invalidate 이후 끝난 이전 계정·이전 회차 응답은 캐시에 쓰지 않는다. */
let cacheGeneration = 0;
const listeners = new Set<() => void>();

function emitProfileFetchCache(): void {
  cacheEpoch += 1;
  for (const l of listeners) l();
}

function writeProfileFetchCache(
  value: MeProfileGetResult,
  opts?: { ttlMs?: number; fromGuestSkip?: boolean }
): void {
  cached = {
    value,
    expiresAt: Date.now() + (opts?.ttlMs ?? BOOT_MINIMAL_TTL_MS),
    fromGuestSkip: opts?.fromGuestSkip === true,
  };
  emitProfileFetchCache();
}

/** CUT-B — StoresHub re-resolves public feed gate when lite profile lands (no boot mutation). */
export function subscribeAppBootProfileFetchCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppBootProfileFetchCacheEpoch(): number {
  return cacheEpoch;
}

export function invalidateAppBootProfileCache(): void {
  cacheGeneration += 1;
  cached = null;
  forgetSingleFlight(BOOT_MINIMAL_FLIGHT);
  emitProfileFetchCache();
}

export function peekAppBootProfileFetchCached(): MeProfileGetResult | null {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  return null;
}

/** True when cached lite result is guest-gate synthetic skip — not a network unauth proof. */
export function isAppBootProfileFetchGuestSkipCached(): boolean {
  return !!cached && cached.expiresAt > Date.now() && cached.fromGuestSkip === true;
}

export function isAppBootProfileCacheFresh(): boolean {
  return !!cached && cached.expiresAt > Date.now();
}

export function fetchAppBootProfileMinimal(): Promise<MeProfileGetResult> {
  const now = Date.now();
  if (isGuestAuthEstablished()) {
    logGuestFetchSkipped("GET:/api/me/profile?lite=1", "fetchAppBootProfileMinimal");
    const guestResult: MeProfileGetResult = { status: 401, json: { ok: false, authenticated: false } };
    if (cached && cached.expiresAt > now && cached.value.status === 401 && cached.fromGuestSkip) {
      return Promise.resolve(cached.value);
    }
    writeProfileFetchCache(guestResult, { fromGuestSkip: true });
    return Promise.resolve(guestResult);
  }
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  return runSingleFlight(BOOT_MINIMAL_FLIGHT, async (): Promise<MeProfileGetResult> => {
    recordBootVerifyFetch("/api/me/profile?lite=1", "app_boot_minimal");
    logShellFetchTrace({
      api: "/api/me/profile",
      component: "fetch-app-boot-profile",
      reason: "fetchAppBootProfileMinimal_network",
    });
    const generation = cacheGeneration;
    const ac = new AbortController();
    const timer = globalThis.setTimeout(() => ac.abort(), APP_BOOT_PROFILE_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/me/profile?lite=1", {
        credentials: "include",
        cache: "no-store",
        signal: ac.signal,
        headers: {
          "x-samarket-client-call-source": "app_boot_minimal",
          "x-samarket-surface": "app_boot",
          "x-samarket-first-paint-blocking": "1",
        },
      });
      let json: unknown;
      try {
        json = await res.json();
      } catch (err) {
        if (ac.signal.aborted) throw err;
        json = {};
      }
      const result: MeProfileGetResult = { status: res.status, json };
      const okBody = res.ok && (json as { ok?: unknown } | null)?.ok === true;
      if ((okBody || res.status === 401 || res.status === 403) && generation === cacheGeneration) {
        writeProfileFetchCache(result, { fromGuestSkip: false });
      }
      return result;
    } finally {
      globalThis.clearTimeout(timer);
    }
  });
}
