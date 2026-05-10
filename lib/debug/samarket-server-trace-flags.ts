/**
 * 진단용 콘솔 출력 게이트 (기본 `npm run dev` 조용 모드).
 * 로직·payload·trace 객체는 변경하지 않고 **출력만** 제어한다.
 *
 * - `SAMARKET_MESSENGER_TRACE_LOG=1` — CM realtime HS4, room bootstrap tier, trade enrich 진단 등
 * - `SAMARKET_FEED_TRACE_LOG=1` — Philife neighborhood-feed 단계 로그 (클라는 `NEXT_PUBLIC_SAMARKET_FEED_TRACE_LOG` 병행)
 * - `SAMARKET_DEV_MONITORING_LOG=1` — in-process 모니터링 스토어 진단 (`[dev-monitoring-store]` 등)
 */

function envTrue(name: string): boolean {
  try {
    return typeof process !== "undefined" && process.env[name] === "1";
  } catch {
    return false;
  }
}

export function samarketMessengerTraceLogEnabled(): boolean {
  return envTrue("SAMARKET_MESSENGER_TRACE_LOG");
}

export function samarketFeedTraceLogEnabled(): boolean {
  return envTrue("SAMARKET_FEED_TRACE_LOG") || envTrue("NEXT_PUBLIC_SAMARKET_FEED_TRACE_LOG");
}

export function samarketDevMonitoringLogEnabled(): boolean {
  return envTrue("SAMARKET_DEV_MONITORING_LOG");
}
