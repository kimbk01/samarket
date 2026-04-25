/**
 * GET /api/me/profile — RegionProvider·getMyProfile·내정보 등 동시 호출 시 한 번으로 합침.
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

export type MeProfileGetResult = {
  status: number;
  json: unknown;
};

const TTL_MS = 12_000;
const FLIGHT_KEY = "me:profile:get" as const;

let cached: { expiresAt: number; value: MeProfileGetResult } | null = null;

/**
 * dedupe 캐시 무효화 시 한 번만 브로드캐스트 — `RegionProvider` 등이 동일 GET 으로
 * 주소·지역 상태를 따라가게 함(각 화면에서 `refreshProfileLocation` 을 또 부르지 않음).
 */
export const ME_PROFILE_CACHE_INVALIDATED_EVENT = "kasama-me-profile-cache-invalidated";

/** 프로필 저장·아바타 등 반영 직후 다음 GET이 서버 값을 보게 함 */
export function invalidateMeProfileDedupedCache(): void {
  cached = null;
  forgetSingleFlight(FLIGHT_KEY);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(ME_PROFILE_CACHE_INVALIDATED_EVENT));
    } catch {
      /* ignore */
    }
  }
}

export function fetchMeProfileDeduped(): Promise<MeProfileGetResult> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  return runSingleFlight(FLIGHT_KEY, () =>
    fetch("/api/me/profile", { credentials: "include", cache: "no-store" })
  ).then(async (res): Promise<MeProfileGetResult> => {
    const json: unknown = await res.clone().json().catch(() => ({}));
    const result: MeProfileGetResult = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 403) {
      cached = { value: result, expiresAt: Date.now() + TTL_MS };
    }
    return result;
  });
}
