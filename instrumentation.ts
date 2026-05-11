/**
 * Next instrumentation hook — Edge 에서 Node 전용 API를 정적으로 참조하지 않도록
 * dev 메모리 로깅은 `lib/dev/instrumentation-dev-memory-watch` 에 위임한다.
 */
export async function register() {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { registerDevMemoryWatch } = await import("./lib/dev/instrumentation-dev-memory-watch");
  registerDevMemoryWatch();
}
