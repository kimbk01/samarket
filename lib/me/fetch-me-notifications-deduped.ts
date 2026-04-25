/**
 * 내 알림 목록 — 동시 요청 합류(runSingleFlight) + 짧은 TTL로 재진입·폴링 부하 완화.
 * 읽음 처리 직후 등은 `{ force: true }` 또는 `invalidateMeNotificationsListDedupedCache()` 로 최신화.
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

const URL = "/api/me/notifications?exclude_owner_store_commerce=1" as const;
const FLIGHT_KEY = "me:notifications:list:exclude_owner_commerce" as const;
const TTL_MS = 20_000;

export type MeNotificationsListResult = {
  status: number;
  json: unknown;
};

let cached: { expiresAt: number; value: MeNotificationsListResult } | null = null;

export function invalidateMeNotificationsListDedupedCache(): void {
  cached = null;
  forgetSingleFlight(FLIGHT_KEY);
}

export type FetchMeNotificationsListOpts = {
  /** true면 TTL 무시·진행 중 비행 초기화 후 서버 재요청 */
  force?: boolean;
};

export function fetchMeNotificationsListDeduped(
  opts?: FetchMeNotificationsListOpts
): Promise<MeNotificationsListResult> {
  const force = !!opts?.force;
  const now = Date.now();
  if (!force && cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  if (force) {
    cached = null;
    forgetSingleFlight(FLIGHT_KEY);
  }
  return runSingleFlight(FLIGHT_KEY, () =>
    fetch(URL, { credentials: "include", cache: "no-store" })
  ).then(async (res): Promise<MeNotificationsListResult> => {
    const json: unknown = await res.clone().json().catch(() => ({}));
    const result = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 503) {
      cached = { value: result, expiresAt: Date.now() + TTL_MS };
    }
    return result;
  });
}
