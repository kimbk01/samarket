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

/** 프로필 저장·아바타 등 반영 직후 다음 GET이 서버 값을 보게 함 */
export function invalidateMeProfileDedupedCache(): void {
  cached = null;
  forgetSingleFlight(FLIGHT_KEY);
}

export function fetchMeProfileDeduped(): Promise<MeProfileGetResult> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  return runSingleFlight(FLIGHT_KEY, async (): Promise<MeProfileGetResult> => {
    const res = await fetch("/api/me/profile", { credentials: "include", cache: "no-store" });
    const json: unknown = await res.json().catch(() => ({}));
    const result: MeProfileGetResult = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 403) {
      cached = { value: result, expiresAt: Date.now() + TTL_MS };
    }
    return result;
  });
}
