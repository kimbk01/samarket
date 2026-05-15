import { logPerfMeasurementContext } from "@/lib/http/perf-measurement-context";

/**
 * 개발 전용 API 단계 계측 — `[dev-api-perf]` prefix.
 * Production 에서는 no-op (로그·오버헤드 없음).
 */
export function logDevApiPerf(
  route: string,
  phases: Record<string, number>,
  extras?: Record<string, string | number | boolean | null | undefined>
): void {
  if (process.env.NODE_ENV !== "development") return;
  const total = typeof phases.total_route_ms === "number" ? phases.total_route_ms : null;
  const payload = {
    ...phases,
    ...(extras ?? {}),
    ...(total != null ? { total_route_ms: total } : {}),
  };
  // eslint-disable-next-line no-console
  console.info("[dev-api-perf]", route, payload);

  const serverHandlerMs = total ?? phases.api_handler_only_ms ?? 0;
  const compileMs =
    typeof phases.api_compile_ms === "number"
      ? phases.api_compile_ms
      : typeof extras?.api_compile_ms === "number"
        ? Number(extras.api_compile_ms)
        : 0;
  const renderMs =
    typeof phases.api_render_ms === "number"
      ? phases.api_render_ms
      : typeof phases.api_handler_only_ms === "number"
        ? phases.api_handler_only_ms
        : serverHandlerMs;
  const wallMs =
    typeof phases.api_total_wall_ms === "number"
      ? phases.api_total_wall_ms
      : compileMs > 0
        ? serverHandlerMs + compileMs
        : undefined;

  logPerfMeasurementContext({
    route,
    server_handler_ms: serverHandlerMs,
    dev_compile_ms: compileMs,
    route_render_ms: renderMs,
    wall_ms: wallMs,
    extras: payload as Record<string, unknown>,
  });
}

export function devPerfNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
