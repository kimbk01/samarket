/**
 * E-C1 — busy dial attempt record helpers.
 *
 * Owner 2026-11-15 「1단계 구현 승인」(docs/audit/call-busy-missed-and-call-waiting-audit-2026-11-14.md §4, Signal 형태):
 * - 상대 통화 중(`peer_busy`): 공유 `call_stub` + 통화 기록을 양쪽이 본다 — 발신자 「통화 중」, 통화 중이던 사람 「부재중」.
 * - 본인 통화 중(`caller_busy`): 지금처럼 발신자 전용(공유 기록·알림 없음, 통화 기록도 발신자만).
 */

export type CallBusyKind = "peer" | "caller";

export const CALL_BUSY_ENDED_REASONS = ["peer_busy", "caller_busy"] as const;
export type CallBusyEndedReason = (typeof CALL_BUSY_ENDED_REASONS)[number];

export function busyEndedReasonForKind(kind: CallBusyKind): CallBusyEndedReason {
  return kind === "caller" ? "caller_busy" : "peer_busy";
}

export function busyKindFromEndedReason(
  endedReason: string | null | undefined
): CallBusyKind | null {
  const er = String(endedReason ?? "")
    .trim()
    .toLowerCase();
  if (er === "caller_busy") return "caller";
  if (er === "peer_busy" || er === "callee_busy" || er === "busy") return "peer";
  return null;
}

/** Session/call_log ended_reason values that must not appear on the peer's call history (본인 통화 중만). */
export function isCallerOnlyBusyEndedReason(endedReason: string | null | undefined): boolean {
  return busyKindFromEndedReason(endedReason) === "caller";
}

/**
 * List filter: 본인 통화 중(`caller_busy`) 기록만 발신자 전용. 상대 통화 중(`peer_busy`)은 양쪽 모두.
 * Non-busy rows unchanged. Missing caller id → exclude caller-only row (fail closed).
 */
export function shouldIncludeCallLogRowForViewer(input: {
  viewerUserId: string;
  callerUserId: string | null | undefined;
  endedReason: string | null | undefined;
}): boolean {
  if (!isCallerOnlyBusyEndedReason(input.endedReason)) return true;
  const viewer = input.viewerUserId.trim().toLowerCase();
  const caller = String(input.callerUserId ?? "")
    .trim()
    .toLowerCase();
  if (!viewer || !caller) return false;
  return viewer === caller;
}
