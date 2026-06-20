"use client";

import { patchCommunityMessengerCallSession } from "@/lib/community-messenger/call-http-actions";
import {
  releaseIncomingCallReject,
  tryClaimIncomingCallReject,
} from "@/lib/community-messenger/incoming-call-action-guard";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import { applyIncomingCallConsumedSideEffects } from "@/lib/community-messenger/incoming-call-consumed-side-effects";
import { hardClearActiveCallSession } from "@/lib/call/active-call-session";
import { syncTerminalCallClientState } from "@/lib/call/call-terminal-sync-cleanup";
import { sealIncomingCallTerminal } from "@/lib/community-messenger/incoming-call/terminal";
import { disposeCallMediaViaDelegate } from "@/lib/call-engine/call-agora-lifecycle";
import { clearAcceptCallPatchedId } from "@/lib/call-engine/accept-call";
import { resetCallEngineToIdle, setCallEnginePhase } from "@/lib/call-engine/call-engine-state";
import { stopCallEngineRing, syncCallEngineRingFromState } from "@/lib/call-engine/call-ring-controller";
import type { CallConsumedReason } from "@/lib/community-messenger/incoming-call/tombstone";

export type CloseCallSessionReason =
  | "cancelled"
  | "rejected"
  | "declined"
  | "ended"
  | "missed"
  | "remote_ended"
  | "caller_end"
  | string;

export type RejectCallResult = {
  ok: boolean;
  sessionId: string;
  reason?: "duplicate_reject_blocked" | "patch_failed" | "exception";
};

export type CloseCallSessionOptions = {
  /** skip server PATCH when already terminal */
  skipPatch?: boolean;
  patchAction?: "cancel" | "reject" | "end" | "missed";
  durationSeconds?: number;
  hardClearedAt?: Map<string, number>;
  source?: string;
};

let hardClearedAtDefault = new Map<string, number>();

export function setCallEngineCloseHardClearedMap(map: Map<string, number>): void {
  hardClearedAtDefault = map;
}

function mapReasonToPatchAction(
  reason: CloseCallSessionReason,
  patchAction?: CloseCallSessionOptions["patchAction"],
): "cancel" | "reject" | "end" | "missed" | null {
  if (patchAction) return patchAction;
  if (reason === "cancelled") return "cancel";
  if (reason === "rejected" || reason === "declined") return "reject";
  if (reason === "missed") return "missed";
  if (reason === "ended" || reason === "remote_ended" || reason === "caller_end") return "end";
  return "end";
}

function mapReasonToConsumed(reason: CloseCallSessionReason): CallConsumedReason {
  if (reason === "cancelled") return "cancelled";
  if (reason === "rejected" || reason === "declined") return "declined";
  if (reason === "missed") return "missed";
  return "ended";
}

export async function rejectCall(
  sessionId: string,
  source: string,
): Promise<RejectCallResult> {
  return closeCallSession(sessionId, "declined", {
    patchAction: "reject",
    source,
  }).then((r) => ({
    ok: r.ok,
    sessionId: r.sessionId,
    reason: r.reason as RejectCallResult["reason"],
  }));
}

/**
 * cancel / reject / end / missed / remote-ended — terminal cleanup 단일 수렴.
 */
export async function closeCallSession(
  sessionId: string,
  reason: CloseCallSessionReason,
  options: CloseCallSessionOptions = {},
): Promise<{ ok: boolean; sessionId: string; reason?: string }> {
  const sid = sessionId.trim();
  if (!sid) return { ok: false, sessionId: "", reason: "exception" };

  const source = options.source ?? reason;
  logDibayCall("engine_close_start", { sessionId: sid, callId: sid, reason, source });

  stopCallEngineRing(sid, `close_${reason}`);
  dismissAllIncomingCallNotificationsFireAndForget(sid);

  setCallEnginePhase({
    phase: "ended",
    sessionId: sid,
    role: null,
    callKind: null,
    source,
  });
  syncCallEngineRingFromState();

  const hardClearedAt = options.hardClearedAt ?? hardClearedAtDefault;
  sealIncomingCallTerminal(sid, mapReasonToConsumed(reason), hardClearedAt, source);
  syncTerminalCallClientState(sid, reason);
  await disposeCallMediaViaDelegate({ domAudioNuclear: true });
  await hardClearActiveCallSession(sid, reason);

  if (!options.skipPatch) {
    const patchAction = mapReasonToPatchAction(reason, options.patchAction);
    if (patchAction) {
      try {
        const patched = await patchCommunityMessengerCallSession(sid, patchAction, {
          durationSeconds: options.durationSeconds,
        });
        if (!patched.ok) {
          applyIncomingCallConsumedSideEffects(sid, mapReasonToConsumed(reason), source);
          return { ok: false, sessionId: sid, reason: "patch_failed" };
        }
      } catch {
        applyIncomingCallConsumedSideEffects(sid, mapReasonToConsumed(reason), source);
        return { ok: false, sessionId: sid, reason: "exception" };
      }
    }
  }

  applyIncomingCallConsumedSideEffects(sid, mapReasonToConsumed(reason), source);
  clearAcceptCallPatchedId(sid);
  resetCallEngineToIdle(`close_${reason}`);
  syncCallEngineRingFromState();

  logDibayCall("engine_close_done", { sessionId: sid, callId: sid, reason, source });
  return { ok: true, sessionId: sid };
}

export async function runEngineIncomingCallReject(args: {
  sessionId: string;
  source: string;
}): Promise<RejectCallResult> {
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  if (!tryClaimIncomingCallReject(args.sessionId)) {
    return { ok: false, sessionId: args.sessionId, reason: "duplicate_reject_blocked" };
  }
  try {
    return await rejectCall(args.sessionId, args.source);
  } finally {
    releaseIncomingCallReject(args.sessionId);
  }
}
