"use client";

import {
  getActiveCallSessionCallId,
  hardClearActiveCallSession,
  readActiveCallSessionSnapshot,
} from "@/lib/call/active-call-session";
import { isOutgoingCallStartBlocked, releaseCallActionLock } from "@/lib/call/call-action-lock";
import { clearAgoraJoinGuard } from "@/lib/call/actions/agora-join-guard";
import { logCallButtonState } from "@/lib/community-messenger/call-engine/call-engine-audit-log";
import { clearCallEngineAgoraJoin } from "@/lib/community-messenger/call-engine/call-engine-agora-gate";
import {
  clearCallEngineLocks,
  clearCallEngineSurfaceOwner,
  getCallEngineSurfaceOwner,
  isCallEngineJoinLocked,
  isCallEngineRouteLocked,
  isCallEngineTerminalConsumed,
  markCallEngineTerminalConsumed,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import {
  clearNativeIncomingSurface,
  dismissNativeForegroundIncomingUi,
} from "@/lib/community-messenger/call-engine/call-engine-native-surface";
import {
  logTerminalPipelineCleanupDone,
  logTerminalPipelineCleanupIncomplete,
  logTerminalPipelineCleanupStep,
  logTerminalPipelineStart,
} from "@/lib/community-messenger/call-engine/call-engine-terminal-pipeline-log";
import { clearCallEngineState, getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import {
  stopCallEngineIncomingRingtone,
  stopCallEngineOutgoingRingback,
} from "@/lib/community-messenger/call-engine/call-engine-ringtone-owner";
import { readCallEngineActiveVideoSession } from "@/lib/community-messenger/call-engine/call-engine-store";
import { syncIncomingCallRing } from "@/lib/community-messenger/incoming-call/ring-owner";
import {
  markCallConsumed,
  readCallConsumedReason,
  type CallConsumedReason,
} from "@/lib/community-messenger/incoming-call-state";
import { clearNativeCalleeAcceptPending } from "@/lib/community-messenger/native-callee-accept-entry";
import {
  clearCommunityCallPresentationFlags,
  clearHostedActiveCallSession,
} from "@/lib/community-messenger/call-presentation-ownership";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";

const HOST_SYNC_EVENT = "samarket:cm-call-host-sync";

function mapReasonToConsumed(reason: string): CallConsumedReason {
  const r = reason.trim().toLowerCase();
  if (r.includes("reject") || r.includes("declin")) return "declined";
  if (r.includes("miss")) return "missed";
  if (r.includes("cancel")) return "cancelled";
  return "ended";
}

function runCleanupStep(callId: string, step: string, fn: () => void): void {
  try {
    fn();
    logTerminalPipelineCleanupStep(callId, step, true);
  } catch {
    logTerminalPipelineCleanupStep(callId, step, false);
  }
}

function notifyCallHostSync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOST_SYNC_EVENT));
}

/** Terminal PATCH·remote terminal 후 클라이언트 잔류 상태 단일 해제 */
export async function releaseCallEngineTerminalLocalState(
  callId: string,
  reason = "terminal",
  options?: { sessionId?: string; source?: string },
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  const sessionId = options?.sessionId?.trim() || sid;

  logTerminalPipelineStart({
    callId: sid,
    reason,
    phase: getCallEngineState(sid),
    source: options?.source ?? "terminal_cleanup",
  });

  runCleanupStep(sid, "releaseCallActionLock", () => releaseCallActionLock(reason));
  runCleanupStep(sid, "stopCallEngineIncomingRingtone", () => stopCallEngineIncomingRingtone(sid, reason));
  runCleanupStep(sid, "stopCallEngineOutgoingRingback", () => stopCallEngineOutgoingRingback(sid, reason));
  runCleanupStep(sid, "syncIncomingCallRing", () => syncIncomingCallRing(null));
  runCleanupStep(sid, "dismissAllIncomingCallNotifications", () =>
    dismissAllIncomingCallNotificationsFireAndForget(sid),
  );
  runCleanupStep(sid, "clearNativeIncomingSurface", () => clearNativeIncomingSurface(sid));
  void dismissNativeForegroundIncomingUi(sid).then(() =>
    logTerminalPipelineCleanupStep(sid, "dismissNativeForegroundIncomingUi", true),
  );
  runCleanupStep(sid, "clearNativeCalleeAcceptPending", () => clearNativeCalleeAcceptPending(sid));
  runCleanupStep(sid, "clearCallEngineLocks", () => clearCallEngineLocks(sid));
  runCleanupStep(sid, "clearCallEngineSurfaceOwner", () => clearCallEngineSurfaceOwner(sid));
  runCleanupStep(sid, "clearCallEngineAgoraJoin", () => clearCallEngineAgoraJoin(sid));
  runCleanupStep(sid, "clearAgoraJoinGuard", () => clearAgoraJoinGuard(sid));
  runCleanupStep(sid, "clearCommunityCallPresentationFlags", () => clearCommunityCallPresentationFlags(sid));
  if (readCallEngineActiveVideoSession() === sid || readCallEngineActiveVideoSession() === sessionId) {
    runCleanupStep(sid, "clearHostedActiveCallSession", () => clearHostedActiveCallSession());
  }

  const consumed = readCallConsumedReason(sid);
  if (!consumed || consumed === "accepted") {
    runCleanupStep(sid, "markCallConsumed", () => markCallConsumed(sid, mapReasonToConsumed(reason)));
  }
  runCleanupStep(sid, "markCallEngineTerminalConsumed", () => markCallEngineTerminalConsumed(sid));
  runCleanupStep(sid, "clearCallEngineState", () => clearCallEngineState(sid));

  await hardClearActiveCallSession(sid, reason, { alternateId: sessionId !== sid ? sessionId : null });

  notifyCallHostSync();
  logCallButtonState({ peerId: sid });
  logTerminalPipelineCleanupDone(sid, reason);

  const remaining: string[] = [];
  const active = getActiveCallSessionCallId();
  if (active) remaining.push(`activeCallSession:${active}`);
  if (getCallEngineSurfaceOwner(sid)) remaining.push("surfaceOwner");
  if (isCallEngineRouteLocked(sid)) remaining.push("routeLock");
  if (isCallEngineJoinLocked(sid)) remaining.push("agoraLock");
  if (readActiveCallSessionSnapshot() && isOutgoingCallStartBlocked()) {
    remaining.push("outgoingBlocked");
  }
  if (remaining.length > 0) {
    logTerminalPipelineCleanupIncomplete(sid, reason, remaining);
  }
}
