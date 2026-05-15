import { logPerfMeasurementContext } from "@/lib/http/perf-measurement-context";

/**
 * 병목 API 라우트 공통 — `[route-perf]` 한 줄 로그 (before/after·캐시·DB 구간).
 */
export type RoutePerfLogInput = {
  route: string;
  total_ms: number;
  db_ms?: number;
  cache_hit?: 0 | 1;
  auth_ms?: number;
  serialize_ms?: number;
  /** 지연 동기화 등: 요청 종료 전 측정값 */
  before_ms?: number;
  /** 백그라운드 완료 후 측정값(선택) */
  after_ms?: number;
  [key: string]: unknown;
};

export function logRoutePerf(input: RoutePerfLogInput): void {
  console.log("[route-perf]", input);
  const compileMs =
    typeof input.dev_compile_ms === "number"
      ? input.dev_compile_ms
      : typeof input.api_compile_ms === "number"
        ? input.api_compile_ms
        : 0;
  const renderMs =
    typeof input.route_render_ms === "number"
      ? input.route_render_ms
      : typeof input.api_render_ms === "number"
        ? input.api_render_ms
        : input.total_ms;
  logPerfMeasurementContext({
    route: input.route,
    server_handler_ms: input.total_ms,
    dev_compile_ms: compileMs,
    route_render_ms: renderMs,
    wall_ms: typeof input.wall_ms === "number" ? input.wall_ms : undefined,
    extras: {
      db_ms: input.db_ms,
      cache_hit: input.cache_hit,
      auth_ms: input.auth_ms,
      serialize_ms: input.serialize_ms,
    },
  });
}
