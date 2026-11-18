/**
 * Next instrumentation hook — Edge 에서 Node 전용 API를 정적으로 참조하지 않도록
 * dev 메모리 로깅은 `lib/dev/instrumentation-dev-memory-watch` 에 위임한다.
 */
import { logDevSafeModeProbeOnce } from "@/lib/dev/is-dev-safe-mode";

export async function register() {
  /**
   * 운영 Supabase 호출 계수기 (요청 예산 계약 — docs/request-budget-ssot.md).
   * 운영 Node 런타임에서만 설치. 실패해도 서버 기동에 영향 없음.
   */
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { installSupabaseCallCounterFromEnv } = await import("./lib/perf/install-supabase-call-counter.server");
      await installSupabaseCallCounterFromEnv();
    } catch (err) {
      console.warn("[supabase-call-counter] install_failed", err instanceof Error ? err.message : "unknown");
    }
  }
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_RUNTIME === "edge") return;
  logDevSafeModeProbeOnce("server");
  /** Dev Stability Pack — 주기 메모리 로그·부가 타이머 생략 */
  if (process.env.DEV_SAFE_MODE === "1") return;
  const v = process.env.SAMARKET_DEV_MEMORY_WATCH?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return;

  const { registerDevMemoryWatch } = await import("./lib/dev/instrumentation-dev-memory-watch");
  registerDevMemoryWatch();
  if (process.env.SAMARKET_DEV_MEASURE_MODE?.trim() !== "1") {
    const { logDevModuleGraphProbe } = await import("./lib/dev/dev-module-graph-probe");
    logDevModuleGraphProbe("instrumentation-register");
  }
}
