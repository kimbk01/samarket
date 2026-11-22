/**
 * 운영 Supabase 호출 계수기 — 서버 프로세스의 fetch 를 감싸 「어느 라우트가 Supabase 를 몇 번 불렀는지」를 센다.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/fundamental-countermeasure-design.md (K5 · 비밀값 없는 방식)
 *
 * - 설치: `instrumentation.ts` register() — 운영(Node 런타임)에서만. 끄기: `SUPABASE_CALL_COUNTER=0`.
 * - 라우트: Next 요청 저장소(work store)의 `route`. 미들웨어(proxy)·백그라운드처럼 저장소가 없으면 `unknown`.
 * - 저장: 기존 U1 집계 표 `cm_monitoring_rollup_hourly` (RPC `cm_monitoring_rollup_add`) — 새 DB 객체 없음.
 *   · category `server.supabase_route`(시험 기기는 `server.supabase_route_test`): event_count=호출 수, value_count=요청 수, value_max=요청 1회 최대 호출
 *   · category `server.supabase_target`: metric=`rest.<표>`·`rpc.<함수>`·`auth.<경로>`·`storage`·`realtime`…, event_count=호출 수
 * - 원래 요청 동작은 바꾸지 않는다: 셈은 try/catch 안에서만 하고 원래 fetch 를 그대로 부른다. 집계 전송은 감싸지 않은 fetch 로 한다(자기 자신을 세지 않음).
 * - 한계: 인스턴스가 멈추면 마지막 전송 뒤 셈(최대 5분)은 잃는다 → 감시는 절대값이 아니라 「1회당 호출 수」·전일 대비 배수로 판정한다.
 */

import { isTestTrafficUserAgent } from "@/lib/perf/test-traffic";

export const SUPABASE_ROUTE_CATEGORY = "server.supabase_route";
export const SUPABASE_ROUTE_TEST_CATEGORY = "server.supabase_route_test";
export const SUPABASE_TARGET_CATEGORY = "server.supabase_target";
/** 2026-11-22 표지 요청의 단위 합(예: 보내기의 받는 사람 수) — event_count = 단위 합, metric = 표지 붙은 라우트 키 */
export const SUPABASE_ROUTE_UNITS_CATEGORY = "server.supabase_route_units";
/** 2026-11-22 표지 요청만 표별 셈 — metric = `<표지 붙은 라우트 키>::<rest.표·rpc.함수…>`, event_count = 호출 수 */
export const SUPABASE_ROUTE_TARGET_CATEGORY = "server.supabase_route_target";

const FLUSH_INTERVAL_MS = 5 * 60_000;
const FLUSH_CALL_THRESHOLD = 2_000;
const ROLLUP_MAX_ROWS = 128;
const METRIC_MAX = 96;

export type SupabaseCallContext = {
  route: string | null;
  /** 요청마다 다른 객체 — 같은 요청의 호출을 묶는다. 없으면 null */
  requestKey: object | null;
  userAgent: string | null;
};

type Bucket = { calls: number; requests: number; maxPerRequest: number };

export type SupabaseCallRollupRow = {
  category: string;
  metric: string;
  outcome: "";
  event_count: number;
  value_count: number;
  value_sum: number;
  value_max: number | null;
  dropped_count: number;
};

/** `/api/community-messenger/rooms/[roomId]/messages` → `api.community-messenger.rooms.:roomid.messages` (집계 표 metric 규칙) */
export function routeToRollupMetric(route: string | null | undefined): string {
  const r = (route ?? "").trim();
  if (!r) return "unknown";
  const m = r
    .toLowerCase()
    .replace(/\[\[?\.\.\.([^\]]+)\]?\]/g, ":$1")
    .replace(/\[([^\]]+)\]/g, ":$1")
    .replace(/^\/+/, "")
    .replace(/\/+/g, ".")
    .replace(/[^a-z0-9_.:-]/g, "_");
  return (m || "root").slice(0, METRIC_MAX);
}

/**
 * 2026-11-22 — 라우트 키에 요청 표지를 붙인다(`…messages` + `post` → `…messages::post`).
 * 집계 함수 `cm_monitoring_rollup_add` 가 metric `^[a-z0-9_.:-]{1,96}$` 만 받으므로 구분자는 `::`(라우트 규칙은 `:` 를 `.` 뒤에만 만든다 → 겹치지 않음).
 * 예산 표 키 `"/api/…/messages@post"` 도 같은 함수로 바꿔 비교한다(`@` 앞만 라우트 규칙으로 바꿈).
 */
const LABEL_SEP = "::";

export function routeLabelToRollupMetric(route: string | null | undefined, label: string | null | undefined): string {
  const l = (label ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 16);
  const base = routeToRollupMetric(route);
  if (!l) return base;
  return `${base.slice(0, METRIC_MAX - l.length - 2)}${LABEL_SEP}${l}`;
}

/** 예산 표 키(`/api/a/[id]/b` 또는 `/api/a/[id]/b@post`) → 집계 metric */
export function budgetKeyToRollupMetric(key: string): string {
  const at = key.lastIndexOf("@");
  return at > 0 ? routeLabelToRollupMetric(key.slice(0, at), key.slice(at + 1)) : routeToRollupMetric(key);
}

/** 집계 metric → 라우트 (예산 대조용). 예산 표의 라우트를 같은 규칙으로 바꿔 비교한다. */
export function rollupMetricMatchesRoute(metric: string, route: string): boolean {
  return routeToRollupMetric(route) === metric;
}

/** Supabase URL → 호출 대상 metric */
export function supabaseTargetMetric(href: string, supabaseOrigin: string): string {
  let path = href.slice(supabaseOrigin.length);
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const seg = path.split("/").filter(Boolean);
  let metric: string;
  if (seg[0] === "rest" && seg[2] === "rpc" && seg[3]) metric = `rpc.${seg[3]}`;
  else if (seg[0] === "rest" && seg[2]) metric = `rest.${seg[2]}`;
  else if (seg[0] === "auth") metric = `auth.${seg.slice(2).join(".") || "root"}`;
  else if (seg[0] === "storage") metric = "storage";
  else if (seg[0] === "realtime") metric = "realtime";
  else if (seg[0] === "functions") metric = "functions";
  else metric = "other";
  return metric.toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, METRIC_MAX);
}

/** 계수기 상태 — 테스트에서 새로 만들 수 있게 클래스로 둔다. */
export class SupabaseCallCounter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly perRequest = new WeakMap<object, number>();
  /** 2026-11-22 요청 표지(요청 저장소 객체 키) — 응답 뒤 작업(after)도 같은 저장소라 같은 표지 */
  private readonly labels = new WeakMap<object, string>();
  private readonly units = new Map<string, number>();
  private pendingCalls = 0;

  constructor(private readonly supabaseOrigin: string) {}

  /** 2026-11-22 — 이 요청에 표지를 단다(핸들러 첫 줄). 이미 셈이 있는 요청이면 표지를 달지 않는다(한 요청이 두 키로 갈리지 않게). */
  tag(ctx: SupabaseCallContext, label: string): boolean {
    if (!ctx.requestKey || !label.trim()) return false;
    if ((this.perRequest.get(ctx.requestKey) ?? 0) > 0) return false;
    this.labels.set(ctx.requestKey, label.trim());
    return true;
  }

  /** 2026-11-22 — 표지 요청에 단위(예: 받는 사람 수)를 더한다. 표지 없는 요청이면 무시 */
  addUnits(ctx: SupabaseCallContext, n: number): boolean {
    if (!ctx.requestKey || !Number.isFinite(n) || n <= 0) return false;
    const label = this.labels.get(ctx.requestKey);
    if (!label) return false;
    const key = `${this.categoryOf(ctx)}|${routeLabelToRollupMetric(ctx.route, label)}`;
    this.units.set(key, (this.units.get(key) ?? 0) + Math.floor(n));
    return true;
  }

  private categoryOf(ctx: SupabaseCallContext): string {
    return isTestTrafficUserAgent(ctx.userAgent) ? SUPABASE_ROUTE_TEST_CATEGORY : SUPABASE_ROUTE_CATEGORY;
  }

  /** href 가 Supabase 호출이면 센다. 반환값: 셌는지 */
  record(href: string, ctx: SupabaseCallContext): boolean {
    if (!href.startsWith(this.supabaseOrigin)) return false;
    const test = isTestTrafficUserAgent(ctx.userAgent);
    const label = ctx.requestKey ? this.labels.get(ctx.requestKey) : undefined;
    const routeMetric = label ? routeLabelToRollupMetric(ctx.route, label) : routeToRollupMetric(ctx.route);
    const routeKey = `${test ? SUPABASE_ROUTE_TEST_CATEGORY : SUPABASE_ROUTE_CATEGORY}|${routeMetric}`;
    const routeBucket = this.bucket(routeKey);
    routeBucket.calls += 1;
    if (ctx.requestKey) {
      const prev = this.perRequest.get(ctx.requestKey) ?? 0;
      if (prev === 0) routeBucket.requests += 1;
      const now = prev + 1;
      this.perRequest.set(ctx.requestKey, now);
      if (now > routeBucket.maxPerRequest) routeBucket.maxPerRequest = now;
    }
    const target = supabaseTargetMetric(href, this.supabaseOrigin);
    this.bucket(`${SUPABASE_TARGET_CATEGORY}|${target}`).calls += 1;
    if (label && !test) {
      this.bucket(`${SUPABASE_ROUTE_TARGET_CATEGORY}|${`${routeMetric}${LABEL_SEP}${target}`.slice(0, METRIC_MAX)}`).calls += 1;
    }
    this.pendingCalls += 1;
    return true;
  }

  get pending(): number {
    return this.pendingCalls;
  }

  /** 모은 값을 집계 행으로 꺼내고 비운다(요청별 진행 셈은 유지 — 긴 요청이 두 번 세지지 않게). */
  drain(): SupabaseCallRollupRow[] {
    const rows: SupabaseCallRollupRow[] = [];
    for (const [key, b] of this.buckets) {
      const sep = key.indexOf("|");
      const category = key.slice(0, sep);
      const isRoute = category === SUPABASE_ROUTE_CATEGORY || category === SUPABASE_ROUTE_TEST_CATEGORY;
      rows.push({
        category,
        metric: key.slice(sep + 1),
        outcome: "",
        event_count: b.calls,
        value_count: isRoute ? b.requests : 0,
        value_sum: isRoute ? b.calls : 0,
        value_max: isRoute && b.maxPerRequest > 0 ? b.maxPerRequest : null,
        dropped_count: 0,
      });
    }
    for (const [key, n] of this.units) {
      const sep = key.indexOf("|");
      if (key.slice(0, sep) !== SUPABASE_ROUTE_CATEGORY) continue; // 시험 기기 단위는 저장하지 않음(판정 제외)
      rows.push({
        category: SUPABASE_ROUTE_UNITS_CATEGORY,
        metric: key.slice(sep + 1),
        outcome: "",
        event_count: n,
        value_count: 0,
        value_sum: 0,
        value_max: null,
        dropped_count: 0,
      });
    }
    this.buckets.clear();
    this.units.clear();
    this.pendingCalls = 0;
    return rows;
  }

  private bucket(key: string): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { calls: 0, requests: 0, maxPerRequest: 0 };
      this.buckets.set(key, b);
    }
    return b;
  }
}

function hrefOf(input: unknown): string | null {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object" && typeof (input as { url?: unknown }).url === "string") {
    return (input as { url: string }).url;
  }
  return null;
}

/** 집계 행 전송 — 감싸지 않은 fetch 로 RPC 를 직접 부른다(128행씩). 실패는 버리고 로그 1줄. */
export async function sendSupabaseCallRollup(
  rows: SupabaseCallRollupRow[],
  opts: { supabaseOrigin: string; serviceKey: string; fetchImpl: typeof fetch },
): Promise<void> {
  for (let i = 0; i < rows.length; i += ROLLUP_MAX_ROWS) {
    const chunk = rows.slice(i, i + ROLLUP_MAX_ROWS);
    try {
      const res = await opts.fetchImpl(`${opts.supabaseOrigin}/rest/v1/rpc/cm_monitoring_rollup_add`, {
        method: "POST",
        headers: {
          apikey: opts.serviceKey,
          Authorization: `Bearer ${opts.serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_platform: "unknown", p_rows: chunk }),
        cache: "no-store",
      });
      if (!res.ok) console.warn("[supabase-call-counter] rollup_failed", res.status);
    } catch (err) {
      console.warn("[supabase-call-counter] rollup_failed", err instanceof Error ? err.message : "unknown");
    }
  }
}

type InstallOptions = {
  supabaseUrl: string;
  serviceKey: string;
  readContext: () => SupabaseCallContext;
};

const INSTALLED = Symbol.for("dibay.supabaseCallCounter.installed");
const READ_CONTEXT = Symbol.for("dibay.supabaseCallCounter.readContext");

type CounterGlobal = typeof globalThis & {
  [INSTALLED]?: SupabaseCallCounter;
  [READ_CONTEXT]?: () => SupabaseCallContext;
};

/**
 * 2026-11-22 — 지금 요청에 표지를 단다(예: 메시지 라우트 POST 첫 줄 `"post"`). 계수기가 없으면(개발·끔) 아무것도 안 함.
 * 요청 동작에 영향 없음(실패는 삼킴). 설계: docs/audit/supabase-request-surge-2026-11-18/request-budget-method-split-design-2026-11-22.md
 */
export function tagSupabaseCallRequest(label: string): void {
  try {
    const g = globalThis as CounterGlobal;
    const counter = g[INSTALLED];
    const read = g[READ_CONTEXT];
    if (counter && read) counter.tag(read(), label);
  } catch {
    /* 셈 실패는 요청에 영향 없음 */
  }
}

/** 2026-11-22 — 표지 요청에 단위(예: 받는 사람 수)를 더한다. 표지 없으면 무시 */
export function addSupabaseCallRequestUnits(n: number): void {
  try {
    const g = globalThis as CounterGlobal;
    const counter = g[INSTALLED];
    const read = g[READ_CONTEXT];
    if (counter && read) counter.addUnits(read(), n);
  } catch {
    /* 셈 실패는 요청에 영향 없음 */
  }
}

/**
 * 프로세스 전역 fetch 를 감싼다. 이미 설치됐으면 아무것도 하지 않는다.
 * Next 가 붙인 fetch 표지(`__nextPatched` 등)는 그대로 옮겨, Next 가 fetch 를 다시 감싸지 않게 한다.
 */
export function installSupabaseCallCounter(opts: InstallOptions): SupabaseCallCounter | null {
  const g = globalThis as CounterGlobal;
  if (g[INSTALLED]) return g[INSTALLED] ?? null;
  let origin: string;
  try {
    origin = new URL(opts.supabaseUrl).origin;
  } catch {
    return null;
  }
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") return null;
  const counter = new SupabaseCallCounter(origin);
  let lastFlushAt = Date.now();
  let flushing = false;

  const flush = () => {
    if (flushing) return;
    const rows = counter.drain();
    lastFlushAt = Date.now();
    if (rows.length === 0) return;
    flushing = true;
    void sendSupabaseCallRollup(rows, { supabaseOrigin: origin, serviceKey: opts.serviceKey, fetchImpl: originalFetch }).finally(
      () => {
        flushing = false;
      },
    );
  };

  const wrapped = function countedFetch(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    try {
      const href = hrefOf(input);
      if (href && counter.record(href, opts.readContext())) {
        if (counter.pending >= FLUSH_CALL_THRESHOLD || Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) flush();
      }
    } catch {
      /* 셈 실패는 요청에 영향 없음 */
    }
    return originalFetch.call(this ?? globalThis, input, init);
  } as typeof fetch;
  for (const key of Object.keys(originalFetch)) {
    (wrapped as unknown as Record<string, unknown>)[key] = (originalFetch as unknown as Record<string, unknown>)[key];
  }
  globalThis.fetch = wrapped;
  g[INSTALLED] = counter;
  g[READ_CONTEXT] = opts.readContext;

  const timer = setInterval(flush, FLUSH_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  return counter;
}
