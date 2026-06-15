import { logCallFlow } from "@/lib/community-messenger/call-flow-log";
import { logCallTerminal } from "@/lib/community-messenger/call-terminal-audit";
import {
  releaseIncomingCallAccept,
  releaseIncomingCallReject,
  resetIncomingCallActionGuards,
} from "@/lib/community-messenger/incoming-call-action-guard";
import { stopCallRingtone } from "@/lib/community-messenger/call-ringtone-controller";

export type IncomingCallCleanupArgs = {
  sessionId: string;
  reason: string;
  stopRingtone?: boolean;
};

/** 수락/거절/취소/타임아웃/라우트 전환 시 벨·busy guard 정리 */
export function runIncomingCallCleanup(args: IncomingCallCleanupArgs): void {
  const sessionId = args.sessionId.trim();
  if (!sessionId) return;

  logCallTerminal("cleanup_start", {
    sessionId,
    reason: args.reason,
    source: "runIncomingCallCleanup",
  });

  logCallFlow("call_cleanup_start", { sessionId, reason: args.reason });

  if (args.stopRingtone !== false) {
    stopCallRingtone(args.reason, sessionId);
  }
  releaseIncomingCallAccept(sessionId);
  releaseIncomingCallReject(sessionId);

  logCallFlow("call_cleanup_done", { sessionId, reason: args.reason });
}

export function resetAllIncomingCallRuntime(sessionId?: string): void {
  if (sessionId) {
    runIncomingCallCleanup({ sessionId, reason: "reset" });
    return;
  }
  stopCallRingtone("reset_all");
  resetIncomingCallActionGuards();
  logCallFlow("call_cleanup_done", { reason: "reset_all" });
}
