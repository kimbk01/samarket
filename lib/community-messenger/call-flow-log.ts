/**
 * 수신·벨·수락/거절·cleanup 관측 로그 — 프로덕션에서도 console.info 로 남긴다.
 */

export type CallFlowLogStep =
  | "call_incoming_received"
  | "call_incoming_deduped"
  | "call_ringtone_start"
  | "call_ringtone_stop"
  | "call_accept_pressed"
  | "call_accept_sent"
  | "call_reject_pressed"
  | "call_reject_sent"
  | "call_navigate_to_call_screen"
  | "call_cleanup_start"
  | "call_cleanup_done";

export function logCallFlow(step: CallFlowLogStep, extra: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  console.info(`[call-flow] ${step}`, {
    step,
    at: Date.now(),
    ...extra,
  });
}
