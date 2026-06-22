"use client";

import {
  patchCommunityMessengerCallSession,
  type CommunityMessengerCallSessionPatchDebugContext,
} from "@/lib/community-messenger/call-http-actions";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import {
  isDibayCallConsumed,
  markCallConsumed,
  type CallConsumedReason,
} from "@/lib/community-messenger/incoming-call-state";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import { getCallEngineState, setCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import {
  clearCallEngineLocks,
  isCallEngineTerminalConsumed,
  markCallEngineTerminalConsumed,
  tryLockCallEngineActionOnce,
  unlockCallEngineAction,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import type { CallEngineActionName, CallEngineTerminalState } from "@/lib/community-messenger/call-engine/call-engine-types";
import { logCallEngineEvent } from "@/lib/community-messenger/call-engine/call-engine-debug";

const TERMINAL_REASON_BY_ACTION: Record<"reject" | "cancel" | "end" | "missed", CallConsumedReason> = {
  reject: "declined",
  cancel: "cancelled",
  end: "ended",
  missed: "missed",
};

function toTerminalState(action: "reject" | "cancel" | "end" | "missed"): CallEngineTerminalState {
  switch (action) {
    case "reject":
      return "rejected";
    case "cancel":
      return "cancelled";
    case "end":
      return "ended";
    case "missed":
      return "missed";
  }
}

export async function runCallEnginePatchAction(args: {
  callId: string;
  action: CallEngineActionName;
  init?: { durationSeconds?: number; clientEndedReason?: string };
  debugContext?: CommunityMessengerCallSessionPatchDebugContext;
  source: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sid = args.callId.trim();
  if (!sid) return { ok: false, error: "invalid_call_id" };
  if (isCallEngineTerminalConsumed(sid) || isDibayCallConsumed(sid)) {
    return { ok: false, error: "terminal_consumed" };
  }
  if (!tryLockCallEngineActionOnce(sid, args.action)) {
    return { ok: false, error: "duplicate_action" };
  }

  logCallEngineEvent("patch_start", { callId: sid, sessionId: sid, action: args.action, source: args.source });
  let releaseLock = true;
  try {
    const patched = await patchCommunityMessengerCallSession(sid, args.action, args.init, args.debugContext);
    if (!patched.ok) {
      return { ok: false, error: patched.error ?? "patch_failed" };
    }

    if (args.action === "accept") {
      setCallEngineState(sid, "joining");
      markCallConsumed(sid, "accepted");
      dibayIncomingLaneStopRing("engine_accept", sid);
      dismissAllIncomingCallNotificationsFireAndForget(sid);
      logCallEngineEvent("accept_done", { callId: sid, sessionId: sid, source: args.source });
      releaseLock = false;
      return { ok: true };
    }

    const terminalAction = args.action as "reject" | "cancel" | "end" | "missed";
    const terminalState = toTerminalState(terminalAction);
    markCallEngineTerminalConsumed(sid);
    markCallConsumed(sid, TERMINAL_REASON_BY_ACTION[terminalAction]);
    setCallEngineState(sid, terminalState);
    dibayIncomingLaneStopRing(`engine_${terminalAction}`, sid);
    dismissAllIncomingCallNotificationsFireAndForget(sid);
    clearCallEngineLocks(sid);
    logCallEngineEvent("terminal_done", {
      callId: sid,
      sessionId: sid,
      action: terminalAction,
      state: terminalState,
      source: args.source,
    });
    releaseLock = false;
    return { ok: true };
  } catch {
    return { ok: false, error: "exception" };
  } finally {
    if (releaseLock) {
      unlockCallEngineAction(sid, args.action);
    }
  }
}

export async function callEngineAcceptIncoming(args: {
  callId: string;
  debugContext?: CommunityMessengerCallSessionPatchDebugContext;
  source: string;
}): Promise<{ ok: boolean; error?: string }> {
  const current = getCallEngineState(args.callId);
  if (current === "idle" || current === "incoming_ringing") {
    setCallEngineState(args.callId, "accepting");
  }
  return runCallEnginePatchAction({
    callId: args.callId,
    action: "accept",
    debugContext: args.debugContext,
    source: args.source,
  });
}
