/**
 * 서버 전용 — `MESSENGER_PERF_HOME_SYNC_STEPS=1` 또는 `SAMARKET_LOG_HOME_SYNC_BREAKDOWN=1` 일 때
 * `[messenger:perf] step_ms: N` 형식으로 console 에 출력.
 */

export function messengerPerfStepsEnabled(): boolean {
  return (
    process.env.MESSENGER_PERF_HOME_SYNC_STEPS === "1" || process.env.SAMARKET_LOG_HOME_SYNC_BREAKDOWN === "1"
  );
}

/** 예: logMessengerPerfMs("fetchMyRoomsPayload", 12.3) → [messenger:perf] fetchMyRoomsPayload_ms: 12 */
export function logMessengerPerfMs(step: string, ms: number): void {
  if (!messengerPerfStepsEnabled()) return;
  const rounded = Math.round(ms * 100) / 100;
  console.info(`[messenger:perf] ${step}_ms:`, rounded);
}
