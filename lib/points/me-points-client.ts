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
import type {
  PointChargeRequestPeriodSummary,
  PointChargeRequestsPage,
  PointHistoryPeriod,
  PointPeriodSummary,
} from "@/lib/points/point-period-history";
import type { StoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";

/** 화면 기간 선택 — 서버가 PHT 날짜를 UTC 경계로 바꾼다 (`period`·`from`·`to`) */
export type MePointsPeriodQuery = {
  period: StoreCommissionPeriod;
  fromDay?: string | null;
  toDay?: string | null;
};

export const ME_POINTS_DEFAULT_PERIOD: MePointsPeriodQuery = { period: "this_month" };
/** 내역·충전 신청 한 쪽 크기 (재감사 R6-a · 사장님 `LedgerPager` 와 같은 20) */
export const ME_POINTS_PAGE_SIZE = 20;

function periodKey(p: MePointsPeriodQuery | undefined): string {
  if (!p) return "none";
  return p.period === "custom" ? `custom:${p.fromDay ?? ""}~${p.toDay ?? ""}` : p.period;
}

function appendPeriod(qs: URLSearchParams, p: MePointsPeriodQuery | undefined): void {
  if (!p) return;
  qs.set("period", p.period);
  if (p.period === "custom") {
    if (p.fromDay) qs.set("from", p.fromDay);
    if (p.toDay) qs.set("to", p.toDay);
  }
}

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
    /** 같은 기간·필터의 전체 건수 */
    total?: number | null;
    /** 쪽 이동 요청(`histOffset`) 응답일 때 */
    offset?: number;
    limit?: number;
  };
  chargeRequests?: PointChargeRequest[];
  period?: PointHistoryPeriod;
  /** 고른 기간의 시작·종료 잔액과 충전·지급·사용·회수 합계 (서버 계산) */
  periodSummary?: PointPeriodSummary | null;
  periodSummaryError?: boolean;
  chargeRequestsPage?: Omit<PointChargeRequestsPage, "items">;
  chargeSummary?: PointChargeRequestPeriodSummary | null;
  /** 취소할 수 있는 대기 충전 신청 수 (기간 무관) */
  pendingChargeCount?: number | null;
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
  maxAgeMs: number = CACHE_TTL_MS,
  period?: MePointsPeriodQuery,
  page?: MePointsPageQuery
): MePointsResponse | null {
  const hit = cache.get(`${filter}|${periodKey(period)}${pageKey(page)}`);
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

/** 쪽 이동 화면(S40) 요청 — 내역·충전 신청 쪽 위치와 대기 거르기 (재감사 R6-a·R6-e) */
export type MePointsPageQuery = {
  histOffset: number;
  chargeOffset: number;
  chargeStatus?: "pending" | null;
  /** false = 같은 기간이라 합계 생략(쪽만 바꿈) */
  withSummary?: boolean;
};

function pageKey(p: MePointsPageQuery | undefined): string {
  if (!p) return "";
  return `|h${p.histOffset}|c${p.chargeOffset}|${p.chargeStatus ?? ""}`;
}

export async function fetchMePoints(opts: {
  filter: PointFinancialFilter;
  cursor?: string | null;
  limit?: number;
  /** 없으면 예전처럼 기간 없이(합계만 이번 달) — 잔액만 쓰는 호출처 */
  period?: MePointsPeriodQuery;
  /** 있으면 offset 쪽 이동 (S40) */
  page?: MePointsPageQuery;
}): Promise<MePointsFetchResult> {
  const qs = new URLSearchParams({ filter: opts.filter, limit: String(opts.limit ?? 30) });
  if (opts.cursor) qs.set("cursor", opts.cursor);
  appendPeriod(qs, opts.period);
  if (opts.page) {
    qs.set("histOffset", String(Math.max(0, Math.trunc(opts.page.histOffset) || 0)));
    qs.set("histLimit", String(ME_POINTS_PAGE_SIZE));
    qs.set("chargeOffset", String(Math.max(0, Math.trunc(opts.page.chargeOffset) || 0)));
    qs.set("chargeLimit", String(ME_POINTS_PAGE_SIZE));
    if (opts.page.chargeStatus) qs.set("chargeStatus", opts.page.chargeStatus);
    if (opts.page.withSummary === false) qs.set("summary", "0");
  }
  const cacheKey = `${opts.filter}|${periodKey(opts.period)}${pageKey(opts.page)}`;
  // 본문은 single-flight 안에서 1회만 파싱 — 합류한 호출이 같은 Response 를 다시 읽지 않게
  const flightKey = `me:points:fin:${cacheKey}:${opts.cursor ?? "0"}:${opts.page?.withSummary === false ? "ns" : "s"}`;
  const result = await runSingleFlight(flightKey, async () => {
    const res = await fetch(`/api/me/points?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as MePointsResponse;
    return { status: res.status, ok: res.ok, json: body };
  });
  // 합계를 뺀 응답(쪽만 바꿈)은 캐시하지 않는다 — 재진입 첫 화면에 합계가 비지 않게
  if (result.ok && result.json?.ok && !opts.cursor && opts.page?.withSummary !== false) {
    cache.set(cacheKey, { value: result.json, savedAt: Date.now() });
  }
  return result;
}

/** 충전 신청 「더 보기」 — 같은 기간의 다음 페이지만 */
export async function fetchMePointChargeRequests(opts: {
  period: MePointsPeriodQuery;
  offset: number;
  limit?: number;
}): Promise<{
  ok: boolean;
  chargeRequests: PointChargeRequest[];
  chargeRequestsPage: Omit<PointChargeRequestsPage, "items"> | null;
}> {
  const qs = new URLSearchParams({ section: "charges", chargeOffset: String(Math.max(0, opts.offset)) });
  if (opts.limit) qs.set("chargeLimit", String(opts.limit));
  appendPeriod(qs, opts.period);
  try {
    const res = await fetch(`/api/me/points?${qs.toString()}`, { credentials: "include", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as MePointsResponse;
    if (!res.ok || !j.ok) return { ok: false, chargeRequests: [], chargeRequestsPage: null };
    return {
      ok: true,
      chargeRequests: Array.isArray(j.chargeRequests) ? j.chargeRequests : [],
      chargeRequestsPage: j.chargeRequestsPage ?? null,
    };
  } catch {
    return { ok: false, chargeRequests: [], chargeRequestsPage: null };
  }
}
