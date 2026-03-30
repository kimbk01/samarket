/**
 * GET /api/me/stores — 짧은 시간에 여러 화면이 동시에 부르면 한 번으로 합침.
 * (매장 관리 허브 vs 주문 목록 등)
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

export type MeStoresListResult = {
  status: number;
  json: unknown;
};

const TTL_MS = 15_000;
const FLIGHT_KEY = "me:stores:list" as const;

let cached: { expiresAt: number; value: MeStoresListResult } | null = null;

/** 매장 생성·수정 직후 등 — 다음 호출이 TTL 없이 서버를 다시 치게 함 */
export function invalidateMeStoresListDedupedCache(): void {
  cached = null;
  forgetSingleFlight(FLIGHT_KEY);
}

export function fetchMeStoresListDeduped(): Promise<MeStoresListResult> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  return runSingleFlight(FLIGHT_KEY, async (): Promise<MeStoresListResult> => {
    const res = await fetch("/api/me/stores", { credentials: "include", cache: "no-store" });
    const json: unknown = await res.json().catch(() => ({}));
    const result = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 503) {
      cached = { value: result, expiresAt: Date.now() + TTL_MS };
    }
    return result;
  });
}
