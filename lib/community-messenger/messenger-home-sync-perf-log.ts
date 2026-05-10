/**
 * 서버 전용 — 아래 env 중 하나일 때 `[messenger:perf] step_ms: N` 형식으로 console.debug 출력.
 * `MESSENGER_PERF_HOME_SYNC_STEPS=1` · `SAMARKET_LOG_HOME_SYNC_BREAKDOWN=1` ·
 * `SAMARKET_MESSENGER_TRACE_LOG=1` · `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1`
 */

export function messengerPerfStepsEnabled(): boolean {
  return (
    process.env.MESSENGER_PERF_HOME_SYNC_STEPS === "1" ||
    process.env.SAMARKET_LOG_HOME_SYNC_BREAKDOWN === "1" ||
    process.env.SAMARKET_MESSENGER_TRACE_LOG === "1" ||
    process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1"
  );
}

/** 예: logMessengerPerfMs("fetchMyRoomsPayload", 12.3) → [messenger:perf] fetchMyRoomsPayload_ms: 12 */
export function logMessengerPerfMs(step: string, ms: number): void {
  if (!messengerPerfStepsEnabled()) return;
  const rounded = Math.round(ms * 100) / 100;
  // eslint-disable-next-line no-console -- gated perf step line
  console.debug(`[messenger:perf] ${step}_ms:`, rounded);
}
