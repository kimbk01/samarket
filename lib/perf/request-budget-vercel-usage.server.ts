/**
 * 2026-11-26 C — 요청 예산 감시를 예산을 정한 측정(Vercel 관측)으로 판정한다.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/budget-alert-final-2026-11-26.md §2-C (Owner 「C·D 승인」 2026-11-26)
 *
 * 왜: 계수기(`supabase-call-counter`)는 인스턴스 메모리에 모았다가 5분마다 보내는데 인스턴스가 멈출 때 보내는 경로가 없어
 * 호출의 42~85% 만 남고(D1), 분모가 「Supabase 를 부른 요청」뿐이라 캐시 라우트 1회당이 부풀었다(D2).
 * 예산 값은 Vercel `external_api_request`(Supabase 호스트) ÷ `request.count` 로 정했다(`request-budget.ts` 머리말).
 *
 * - 토큰: 환경변수 `VERCEL_OBSERVABILITY_TOKEN`(Owner 가 만들고 등록). 없거나 조회·해석이 실패하면 null → 호출부가 계수기로 판정.
 * - 창: 판정 시각 직전의 **UTC 하루**(00:00~24:00 UTC = 08:00~08:00 PHT). Vercel 하루 묶음은 UTC 날 경계로 맞춰진다.
 * - 미들웨어(`/_middleware`)·라우트 없는 호출은 `unknown`(계수기와 같은 취급 — 총량에만 포함).
 */
import { routeToRollupMetric } from "@/lib/perf/supabase-call-counter";
import type { RouteUsage } from "@/lib/perf/request-budget-watch";
import { DAILY_TOTAL_BASELINE_DAYS } from "@/lib/perf/request-budget";

const API = "https://api.vercel.com/v2/observability/query";
/** 비밀값 아님 — 운영 프로젝트 식별자. 바꿀 때만 환경변수로 덮는다 */
export const DEFAULT_TEAM_ID = "team_pvmVIRp0rvayJ1LN07RLLlft";
export const DEFAULT_PROJECT_ID = "prj_F75kGK83Sd7B4An6IURjQUc0VW5D";
const DAY_MS = 24 * 60 * 60_000;
const GROUP_LIMIT = 1000;
const TIMEOUT_MS = 20_000;

export type VercelUsage = {
  last24h: RouteUsage[];
  previousDailyTotals: number[];
  windowStart: string;
  windowEnd: string;
};

type Row = Record<string, unknown>;

/** 응답 본문 → 행 목록. MCP·REST 감싸기 차이(`result.data` / `data`)를 모두 받는다 */
export function observabilityRows(body: unknown): Row[] | null {
  const b = body as { result?: { data?: unknown }; data?: unknown } | null;
  const data = b?.result?.data ?? b?.data;
  return Array.isArray(data) ? (data.filter((r) => r && typeof r === "object") as Row[]) : null;
}

/** 행의 합계 값 — 키 이름 표기(snake·camel)에 상관없이 `…count_sum`/`…CountSum` 숫자 */
export function rowCount(row: Row): number | null {
  for (const [k, v] of Object.entries(row)) {
    if (/count_?sum$/i.test(k) && typeof v === "number" && Number.isFinite(v)) return v;
  }
  for (const [k, v] of Object.entries(row)) {
    if (/count_?sum$/i.test(k) && v == null) return 0;
  }
  return null;
}

function rowRoute(row: Row, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string") return v;
  }
  return null;
}

/** Vercel 라우트 → 계수기 metric (예산 표 대조용). 미들웨어·빈 값 = unknown */
export function vercelRouteToMetric(route: string | null): string {
  const r = (route ?? "").trim();
  if (!r || r === "/_middleware") return "unknown";
  return routeToRollupMetric(r);
}

export function utcDayWindow(nowMs: number): { start: number; end: number } {
  const end = Math.floor(nowMs / DAY_MS) * DAY_MS;
  return { start: end - DAY_MS, end };
}

/** 2026-11-26 D4 — 매시 이상 감시(`hourly-anomaly-watch.server.ts`)도 같은 조회를 쓴다 */
export async function queryVercelObservability(
  token: string,
  teamId: string,
  projectId: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<Row[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${API}?teamId=${encodeURIComponent(teamId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, scope: { type: "project", ownerId: teamId, projectIds: [projectId] } }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`vercel_observability_${res.status}`);
    const rows = observabilityRows(await res.json());
    if (!rows) throw new Error("vercel_observability_unparsed");
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 직전 UTC 하루의 라우트별 Supabase 호출·요청 수 + 그 전 7일 하루 합계.
 * 토큰이 없거나 어느 조회든 실패·해석 불가면 null (호출부가 계수기로 판정 — 기존 동작).
 */
export async function loadVercelRequestBudgetUsage(
  nowMs: number,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<VercelUsage | null> {
  const env = opts.env ?? process.env;
  const token = env.VERCEL_OBSERVABILITY_TOKEN?.trim();
  if (!token) return null;
  const teamId = env.VERCEL_OBSERVABILITY_TEAM_ID?.trim() || DEFAULT_TEAM_ID;
  const projectId = env.VERCEL_OBSERVABILITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { start, end } = utcDayWindow(nowMs);
  const iso = (ms: number) => new Date(ms).toISOString();
  const supabase = "contains(request_hostname, 'supabase')";
  try {
    const [callRows, reqRows, dayRows] = await Promise.all([
      queryVercelObservability(token, teamId, projectId, {
        metric: "vercel.external_api_request.count",
        startTime: iso(start),
        endTime: iso(end),
        granularity: { hours: 24 },
        filter: supabase,
        groupBy: ["origin_route"],
        limit: GROUP_LIMIT,
      }, fetchImpl),
      queryVercelObservability(token, teamId, projectId, {
        metric: "vercel.request.count",
        startTime: iso(start),
        endTime: iso(end),
        granularity: { hours: 24 },
        groupBy: ["route"],
        limit: GROUP_LIMIT,
      }, fetchImpl),
      queryVercelObservability(token, teamId, projectId, {
        metric: "vercel.external_api_request.count",
        startTime: iso(start - DAILY_TOTAL_BASELINE_DAYS * DAY_MS),
        endTime: iso(start),
        granularity: { hours: 24 },
        filter: supabase,
      }, fetchImpl),
    ]);

    const byMetric = new Map<string, RouteUsage>();
    const get = (m: string) => {
      const u = byMetric.get(m) ?? { metric: m, calls: 0, requests: 0 };
      byMetric.set(m, u);
      return u;
    };
    for (const r of callRows) {
      const n = rowCount(r);
      if (n == null) throw new Error("vercel_observability_unparsed_count");
      get(vercelRouteToMetric(rowRoute(r, ["origin_route", "originRoute"]))).calls += n;
    }
    for (const r of reqRows) {
      const n = rowCount(r);
      if (n == null) throw new Error("vercel_observability_unparsed_count");
      const m = vercelRouteToMetric(rowRoute(r, ["route"]));
      /** 요청은 Supabase 를 부른 라우트에만 붙인다(호출 없는 라우트는 판정 대상 아님) */
      const u = byMetric.get(m);
      if (u) u.requests += n;
    }
    const last24h = [...byMetric.values()];
    if (last24h.reduce((s, u) => s + u.calls, 0) <= 0) throw new Error("vercel_observability_empty");

    /** 최근 → 과거 순 하루 합계 (계수기 판정과 같은 순서) */
    const previousDailyTotals = new Array<number>(DAILY_TOTAL_BASELINE_DAYS).fill(0);
    for (const r of dayRows) {
      const t = Date.parse(String(r.timestamp ?? ""));
      const n = rowCount(r);
      if (!Number.isFinite(t) || n == null) continue;
      const idx = Math.floor((start - t - 1) / DAY_MS);
      if (idx >= 0 && idx < DAILY_TOTAL_BASELINE_DAYS) previousDailyTotals[idx]! += n;
    }
    return { last24h, previousDailyTotals, windowStart: iso(start), windowEnd: iso(end) };
  } catch (err) {
    console.error("[request-budget-watch] vercel_usage_failed", err instanceof Error ? err.message : "unknown");
    return null;
  }
}
