import type { RouteCacheBypassReason } from "@/lib/http/route-cache-bypass";
import { buildPerfMeasureResponseHeaders } from "@/lib/performance/prod-same-region-perf";

export function storePublicApiPerfHeaders(opts: {
  startedAt?: number;
  actual_handler_ms?: number;
  cache_hit: 0 | 1;
  db_execution_ms: number;
  query_count: number;
  bypass: boolean;
  bypass_reason: RouteCacheBypassReason | null;
}): Record<string, string> {
  const handlerMs =
    opts.actual_handler_ms ??
    Math.round(performance.now() - (opts.startedAt ?? performance.now()));
  return buildPerfMeasureResponseHeaders({
    actual_handler_ms: handlerMs,
    cache_hit: opts.cache_hit,
    db_execution_ms: opts.db_execution_ms,
    query_count: opts.query_count,
    cache_bypass: opts.bypass ? 1 : 0,
    cache_bypass_reason: opts.bypass_reason,
  });
}
