/**
 * DIBAY 통화 플로우 단일 로그 계약 — prefix `[DIBAY_CALL]` 고정.
 */

export type DibayCallFlowStep =
  | "permission_check_start"
  | "permission_check_result"
  | "permission_prompt_open"
  | "permission_prompt_granted"
  | "permission_prompt_denied"
  | "outgoing_blocked_permission"
  | "incoming_accept_blocked_permission"
  | "native_accept_start"
  | "native_accept_success"
  | "web_accept_start"
  | "web_accept_success"
  | "agora_join_start"
  | "agora_join_success"
  | "call_service_start"
  | "call_service_stop"
  | "app_swipe_detected"
  | "call_end_sent_to_peer"
  | "duplicate_activity_blocked"
  | "route_latch_claimed"
  | "route_latch_rejected"
  | "route_latch_cleared"
  | "call_service_already_running"
  | "agora_join_duplicate_blocked"
  | "call_heartbeat_ping"
  | "call_heartbeat_timeout"
  | "accept_click"
  | "accept_start"
  | "accept_success"
  | "call_start"
  | "call_end"
  | "cleanup_start"
  | "cleanup_done"
  | "ring_start"
  | "ring_stop"
  | "connected"
  | "join_fail"
  | "state_end"
  | "active_session_create"
  | "active_session_resume_from_native"
  | "task_removed_keep_foreground_service"
  | "notification_resume_route"
  | "call_history_start_lock_acquired"
  | "call_history_start_lock_reused"
  | "call_history_start_blocked_active_call"
  | "active_session_hard_clear"
  | "foreground_service_started"
  | "foreground_service_stopped"
  | "active_call_cleanup_blocked";

import { bridgeDibayCallLogToQa } from "@/lib/call/qa/dibay-call-qa-log-bridge";

const emittedSteps = new Set<string>();

function resolveSessionKey(extra: Record<string, unknown>): string | null {
  const raw = extra.sessionId ?? extra.callId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function logDibayCallFlow(
  step: DibayCallFlowStep,
  extra: Record<string, unknown> = {},
  opts?: { repeat?: boolean },
): void {
  if (typeof window === "undefined") return;
  const sessionId = resolveSessionKey(extra);
  if (sessionId && !opts?.repeat) {
    const key = `${sessionId}:${step}`;
    if (emittedSteps.has(key)) return;
    emittedSteps.add(key);
  }
  console.info(`[DIBAY_CALL] ${step}`, { step, at: Date.now(), ...extra });
  bridgeDibayCallLogToQa(step, extra);
}

/** 테스트·세션 리셋용 */
export function resetDibayCallFlowLogForTests(): void {
  emittedSteps.clear();
}
