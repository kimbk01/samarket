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
  // eslint-disable-next-line no-console
  console.info("[dev-api-perf]", route, {
    ...phases,
    ...(extras ?? {}),
    ...(total != null ? { total_route_ms: total } : {}),
  });
}

export function devPerfNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
