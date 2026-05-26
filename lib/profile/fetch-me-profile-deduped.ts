/**
 * GET /api/me/profile — RegionProvider·getMyProfile·내정보 등 동시 호출 시 한 번으로 합침.
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import { recordBootVerifyFetch } from "@/lib/app-boot/client-boot-request-journal";
import { logShellFetchTrace } from "@/lib/dibay/shell-fetch-trace";

export type MeProfileGetResult = {
  status: number;
  json: unknown;
};

const TTL_MS = 4_000;
const FLIGHT_KEY_FULL = "me:profile:get:full" as const;

let cachedFull: { expiresAt: number; value: MeProfileGetResult } | null = null;
/** boot minimal 직후 full GET 중복 스케줄만 막음 — cachedFull 에 minimal 을 넣지 않음(consent 계약). */
let cachedBootBridge: { expiresAt: number } | null = null;

/**
 * dedupe 캐시 무효화 시 한 번만 브로드캐스트 — `RegionProvider` 등이 동일 GET 으로
 * 주소·지역 상태를 따라가게 함(각 화면에서 `refreshProfileLocation` 을 또 부르지 않음).
 */
export const ME_PROFILE_CACHE_INVALIDATED_EVENT = "kasama-me-profile-cache-invalidated";

/** 프로필 저장·아바타 등 반영 직후 다음 GET이 서버 값을 보게 함 */
export function invalidateMeProfileDedupedCache(): void {
  cachedFull = null;
  cachedBootBridge = null;
  forgetSingleFlight(FLIGHT_KEY_FULL);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(ME_PROFILE_CACHE_INVALIDATED_EVENT));
    } catch {
      /* ignore */
    }
  }
}

export function peekMeProfileCached(): MeProfileGetResult | null {
  return cachedFull?.value ?? null;
}

export function isMeProfileCacheFresh(): boolean {
  const now = Date.now();
  return (
    (!!cachedFull && cachedFull.expiresAt > now) ||
    (!!cachedBootBridge && cachedBootBridge.expiresAt > now)
  );
}

/** App boot minimal 응답 — full GET 합류 전 3s 브릿지(Region·consent·compliance 중복 full 방지). */
export function primeMeProfileDedupedFromBoot(result: MeProfileGetResult): void {
  if (result.status !== 200 && result.status !== 401 && result.status !== 403) return;
  cachedBootBridge = { expiresAt: Date.now() + 3_000 };
}

function profileFetchHeaders(clientCallSource: string | undefined, extra: Record<string, string> = {}): HeadersInit {
  return {
    ...(clientCallSource ? { "x-samarket-client-call-source": clientCallSource } : {}),
    ...extra,
  };
}

/** Surface/Detail — full profile (boot 이후 background·on-demand). */
export function fetchMeProfileDeduped(clientCallSource?: string): Promise<MeProfileGetResult> {
  return fetchMeProfileFullBackground(clientCallSource);
}

export function fetchMeProfileFullBackground(clientCallSource?: string): Promise<MeProfileGetResult> {
  const now = Date.now();
  if (cachedFull && cachedFull.expiresAt > now) {
    return Promise.resolve(cachedFull.value);
  }
  return runSingleFlight(FLIGHT_KEY_FULL, () => {
    recordBootVerifyFetch("/api/me/profile?mode=full", clientCallSource ?? "profile_full");
    logShellFetchTrace({
      api: "/api/me/profile",
      component: clientCallSource ?? "fetch-me-profile-deduped",
      reason: "fetchMeProfileFullBackground_network",
    });
    return fetch("/api/me/profile?mode=full", {
      credentials: "include",
      cache: "no-store",
      headers: profileFetchHeaders(clientCallSource, {
        "x-samarket-first-paint-blocking": "0",
        "x-samarket-surface": "background",
      }),
    });
  }).then(async (res): Promise<MeProfileGetResult> => {
    const json: unknown = await res.clone().json().catch(() => ({}));
    const result: MeProfileGetResult = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 403) {
      cachedFull = { value: result, expiresAt: Date.now() + TTL_MS };
    }
    return result;
  });
}
