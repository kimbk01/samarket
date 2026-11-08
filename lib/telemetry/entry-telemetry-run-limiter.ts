import { ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN } from "@/lib/telemetry/entry-telemetry-contract";

/**
 * C8 수집 API — 실행 ID 당 이벤트 상한 (서버 인스턴스 메모리, 사용자·IP 미보관).
 * 반복 전송·남용으로 로그가 불어나지 않게 한다. 인스턴스 간 공유는 하지 않는다(상한 초과분은 인스턴스 수만큼만 늘어남).
 */
const RUN_COUNTS = new Map<string, number>();
const RUN_COUNTS_MAX_KEYS = 10_000;

/** true = 이번 이벤트를 기록해도 됨 (그리고 1 증가). */
export function admitEntryTelemetryRun(run: string): boolean {
  const used = RUN_COUNTS.get(run) ?? 0;
  if (used >= ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN) return false;
  if (RUN_COUNTS.size >= RUN_COUNTS_MAX_KEYS) RUN_COUNTS.clear();
  RUN_COUNTS.set(run, used + 1);
  return true;
}

export function resetEntryTelemetryRunLimiterForTests(): void {
  RUN_COUNTS.clear();
}
