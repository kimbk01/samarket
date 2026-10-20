/**
 * `GET /api/me/points` 클라이언트 — 포인트(S40)·소멸 예정(S42) 공용.
 * - 같은 키 동시 요청은 `runSingleFlight` 로 1회.
 * - 첫 페이지 응답은 필터별 메모리 캐시(5분) — 재진입 시 스켈레톤 없이 즉시 그리고 조용히 갱신(§1.7).
 *   S40 → S42 로 넘어가면 같은 응답(`expiring`)을 재사용해 추가 요청 0.
 * - 로그아웃·계정 전환 시 `clearMePointsCache()`.
 */
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { PointChargeRequest } from "@/lib/types/point";
import type {
  PointFinancialFilter,
  PointFinancialHistoryItem,
  PointFinancialSummary,
} from "@/lib/points/point-financial-history";
import type { ExpiringPointEntry } from "@/lib/points/point-expire-utils";

export type MePointsExpiring = {
  totalExpiringPoint: number;
  nearestExpireAt: string | null;
  expiringEntriesCount: number;
  entries?: ExpiringPointEntry[];
};

export type MePointsResponse = {
  ok?: boolean;
  error?: string;
  balance?: number;
  summary?: PointFinancialSummary;
  history?: {
    items?: PointFinancialHistoryItem[];
    hasMore?: boolean;
    nextCursor?: string | null;
  };
  chargeRequests?: PointChargeRequest[];
  /** A8 — 조회 실패 시 null + `expiringError:true` (0 으로 대체 금지) */
  expiring?: MePointsExpiring | null;
  expiringError?: boolean;
};

export type MePointsFetchResult = { status: number; ok: boolean; json: MePointsResponse };

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: MePointsResponse; savedAt: number }>();

export function clearMePointsCache(): void {
  cache.clear();
}

if (typeof window !== "undefined") {
  // 로그아웃·계정 전환 시 이전 회원 잔액을 다시 보이지 않게
  window.addEventListener(TEST_AUTH_CHANGED_EVENT, clearMePointsCache);
}

/** 첫 페이지 캐시 — `maxAgeMs` 안의 값만 */
export function peekMePointsCache(
  filter: PointFinancialFilter = "all",
  maxAgeMs: number = CACHE_TTL_MS
): MePointsResponse | null {
  const hit = cache.get(filter);
  if (!hit) return null;
  if (Date.now() - hit.savedAt > Math.min(maxAgeMs, CACHE_TTL_MS)) return null;
  return hit.value;
}

/** 가장 최근 성공 응답(필터 무관) — 잔액·소멸 예정·충전 요청은 필터와 무관하게 같다 */
export function peekLatestMePoints(maxAgeMs: number = CACHE_TTL_MS): MePointsResponse | null {
  let best: { value: MePointsResponse; savedAt: number } | null = null;
  for (const v of cache.values()) {
    if (!best || v.savedAt > best.savedAt) best = v;
  }
  if (!best || Date.now() - best.savedAt > Math.min(maxAgeMs, CACHE_TTL_MS)) return null;
  return best.value;
}

export async function fetchMePoints(opts: {
  filter: PointFinancialFilter;
  cursor?: string | null;
  limit?: number;
}): Promise<MePointsFetchResult> {
  const qs = new URLSearchParams({ filter: opts.filter, limit: String(opts.limit ?? 30) });
  if (opts.cursor) qs.set("cursor", opts.cursor);
  // 본문은 single-flight 안에서 1회만 파싱 — 합류한 호출이 같은 Response 를 다시 읽지 않게
  const result = await runSingleFlight(`me:points:fin:${opts.filter}:${opts.cursor ?? "0"}`, async () => {
    const res = await fetch(`/api/me/points?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as MePointsResponse;
    return { status: res.status, ok: res.ok, json: body };
  });
  if (result.ok && result.json?.ok && !opts.cursor) {
    cache.set(opts.filter, { value: result.json, savedAt: Date.now() });
  }
  return result;
}
