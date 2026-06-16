import { logDibayCall, type DibayCallLogStep } from "@/lib/community-messenger/call-orchestrator";

/**
 * 수신·벨·수락/거절·cleanup 관측 로그 — 프로덕션에서도 console.info 로 남긴다.
 * 기존 호출부는 유지하되 출력은 단일 `[DIBAY_CALL]` 계약으로 보낸다.
 */

export type CallFlowLogStep =
  | "call_incoming_received"
  | "call_incoming_deduped"
  | "call_ringtone_start"
  | "call_ringtone_stop"
  | "call_ringtone_aborted"
  | "call_accept_pressed"
  | "call_accept_sent"
  | "call_reject_pressed"
  | "call_reject_sent"
  | "call_navigate_to_call_screen"
  | "call_cleanup_start"
  | "call_cleanup_done";

const DIBAY_CALL_FLOW_STEP_MAP: Record<CallFlowLogStep, DibayCallLogStep> = {
  call_incoming_received: "push_received",
  call_incoming_deduped: "push_received",
  call_ringtone_start: "ring_start",
  call_ringtone_stop: "ring_stop",
  call_ringtone_aborted: "ring_stop",
  call_accept_pressed: "accept_click",
  call_accept_sent: "accept_success",
  call_reject_pressed: "call_end",
  call_reject_sent: "state_end",
  call_navigate_to_call_screen: "surface_mounted",
  call_cleanup_start: "cleanup_start",
  call_cleanup_done: "cleanup_done",
};

export function logCallFlow(step: CallFlowLogStep, extra: Record<string, unknown> = {}): void {
  logDibayCall(DIBAY_CALL_FLOW_STEP_MAP[step], {
    legacyStep: step,
    ...extra,
  });
}
