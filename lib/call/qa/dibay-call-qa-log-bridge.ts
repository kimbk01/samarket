"use client";

import { appendDibayCallQaLog } from "@/lib/call/qa/dibay-call-qa-log";

/** Map orchestrator/flow log steps into P4 QA ring buffer (no dedup — full timeline). */
const QA_STEP_ALIASES: Record<string, string> = {
  connected: "active_call_connected",
  foreground_service_started: "active_call_foreground_service_started",
  call_end_sent_to_peer: "local_end_notified_remote",
  active_session_hard_clear: "active_call_cleanup",
  terminal_received: "remote_ended_received",
};

export function bridgeDibayCallLogToQa(
  step: string,
  extra: Record<string, unknown> = {},
): void {
  const callId =
    (typeof extra.callId === "string" && extra.callId.trim()) ||
    (typeof extra.sessionId === "string" && extra.sessionId.trim()) ||
    undefined;
  const mediaType =
    (typeof extra.mediaType === "string" && extra.mediaType) ||
    (typeof extra.callKind === "string" && extra.callKind) ||
    undefined;
  const phase = typeof extra.phase === "string" ? extra.phase : undefined;
  const reason = typeof extra.reason === "string" ? extra.reason : undefined;

  appendDibayCallQaLog({
    step,
    callId,
    mediaType,
    phase,
    reason,
    cleanupReason: step === "active_call_cleanup" || step === "active_session_hard_clear" ? reason : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  });

  const alias = QA_STEP_ALIASES[step];
  if (alias && alias !== step) {
    appendDibayCallQaLog({
      step: alias,
      callId,
      mediaType,
      phase,
      reason,
      cleanupReason: alias === "active_call_cleanup" ? reason : undefined,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    });
  }
}
