/**
 * prod_same_region 실측 — `SAMARKET_PROD_PERF_MEASURE=1` 시 핵심 breakdown만 production 에서도 출력.
 * 구조·캐시·SQL 변경 없음 (관측 게이트만).
 */

export type ProdRegionContext = {
  vercel_region: string | null;
  supabase_region: string | null;
  client_region: string | null;
  same_region: boolean;
  edge_or_node: "edge" | "nodejs" | "unknown";
  deployment_type: "vercel" | "vercel_preview" | "local_prod" | "development" | "unknown";
};

/** `npm run start` + prod measure — dev compile/HMR 없이 API·waterfall 로그 */
export function isProdPerfMeasureEnabled(): boolean {
  return process.env.SAMARKET_PROD_PERF_MEASURE?.trim() === "1";
}

/** perf-real-api-cost · cm-unread-deep · order-counts-cold · waterfall */
export function isProdPerfLogEnabled(): boolean {
  return isProdPerfMeasureEnabled() || process.env.NODE_ENV === "development";
}

export function isOwnerDashboardMeasureInvalidateEnabled(): boolean {
  return isProdPerfLogEnabled();
}

/** 브라우저 waterfall (`NEXT_PUBLIC_*` 는 build 시 주입) */
export function isClientProdPerfLogEnabled(): boolean {
  if (typeof window === "undefined") {
    return process.env.NODE_ENV === "development";
  }
  const g = globalThis as { __SAMARKET_PROD_PERF_MEASURE__?: boolean };
  if (g.__SAMARKET_PROD_PERF_MEASURE__ === true) return true;
  return process.env.NEXT_PUBLIC_SAMARKET_PROD_PERF_MEASURE === "1";
}

function inferSupabaseRegionFromUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim().toLowerCase();
  const pooler = /aws-0-([a-z0-9-]+)\.pooler\.supabase\.com/.exec(u);
  if (pooler?.[1]) return pooler[1];
  const host = /https:\/\/([^.]+)\.supabase\.co/.exec(u);
  if (!host) return null;
  const project = host[1];
  if (/^[a-z]{2}-[a-z]+-\d+$/.test(project)) return project;
  return null;
}

export function buildProdRegionContext(opts?: {
  client_region?: string | null;
  runtime?: "edge" | "nodejs";
}): ProdRegionContext {
  const vercel_region =
    process.env.VERCEL_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    null;

  const supabase_region =
    process.env.SUPABASE_REGION?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_REGION?.trim() ||
    inferSupabaseRegionFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    inferSupabaseRegionFromUrl(process.env.SUPABASE_URL) ||
    null;

  const client_region = opts?.client_region?.trim() || process.env.SAMARKET_CLIENT_REGION?.trim() || null;

  const same_region = Boolean(
    vercel_region && supabase_region && vercel_region.toLowerCase() === supabase_region.toLowerCase()
  );

  const edge_or_node: ProdRegionContext["edge_or_node"] =
    opts?.runtime === "edge" ? "edge" : opts?.runtime === "nodejs" ? "nodejs" : "unknown";

  let deployment_type: ProdRegionContext["deployment_type"] = "unknown";
  if (process.env.NODE_ENV === "development") deployment_type = "development";
  else if (process.env.VERCEL === "1") {
    deployment_type = process.env.VERCEL_ENV === "production" ? "vercel" : "vercel_preview";
  } else if (process.env.NODE_ENV === "production") {
    deployment_type = "local_prod";
  }

  return {
    vercel_region,
    supabase_region,
    client_region,
    same_region,
    edge_or_node,
    deployment_type,
  };
}

let prodRegionContextLogged = false;

export function logProdRegionContext(
  ctx: ProdRegionContext,
  extras?: Record<string, string | number | boolean | null>
): void {
  if (!isProdPerfLogEnabled()) return;
  const payload = { ...ctx, ...(extras ?? {}) };
  // eslint-disable-next-line no-console -- prod_same_region measurement
  console.info(`[prod-region-context] ${JSON.stringify(payload)}`);
  prodRegionContextLogged = true;
}

export function logProdRegionContextOnce(
  opts?: Parameters<typeof buildProdRegionContext>[0]
): ProdRegionContext {
  const ctx = buildProdRegionContext(opts);
  if (!prodRegionContextLogged) logProdRegionContext(ctx);
  return ctx;
}

/** 원격 `measure:prod-same-region` — Vercel 로그 없이 응답 헤더로 handler·cache 전달 */
export function buildPerfMeasureResponseHeaders(metrics: {
  actual_handler_ms: number;
  cache_hit?: 0 | 1;
  transport_ms?: number;
  db_execution_ms?: number;
}): Record<string, string> {
  if (!isProdPerfMeasureEnabled()) return {};
  const h: Record<string, string> = {
    "x-samarket-actual-handler-ms": String(Math.round(metrics.actual_handler_ms)),
  };
  if (metrics.cache_hit != null) h["x-samarket-cache-hit"] = String(metrics.cache_hit);
  if (metrics.transport_ms != null) h["x-samarket-transport-ms"] = String(Math.round(metrics.transport_ms));
  if (metrics.db_execution_ms != null) h["x-samarket-db-execution-ms"] = String(Math.round(metrics.db_execution_ms));
  return h;
}
