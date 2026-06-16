/**
 * FCM call event normalizer — signal only, not state.
 * See docs/community-messenger/incoming-call-ssot.md
 */
import {
  type CallTerminalTombstoneContext,
  isCallTerminal,
} from "@/lib/community-messenger/call-state/call-terminal-tombstone";

export type FcmTerminalKind = "cancelled" | "ended" | "rejected" | "missed";

export type NormalizedFcmCallEvent =
  | {
      action: "wake_incoming";
      callId: string;
      fcmType: string;
      callPushKind?: string;
    }
  | {
      action: "terminal";
      callId: string;
      terminalKind: FcmTerminalKind;
      fcmType: string;
      callPushKind?: string;
    }
  | {
      action: "ignore";
      callId: string;
      reason: "terminal_tombstone" | "empty_call_id" | "unsupported_signal";
      fcmType: string;
    };

const TERMINAL_TYPE_MAP: Record<string, FcmTerminalKind> = {
  call_canceled: "cancelled",
  call_cancelled: "cancelled",
  call_ended: "ended",
  call_rejected: "rejected",
  call_missed: "missed",
  missed_call: "missed",
};

export function resolveFcmTerminalKind(
  type: string | null | undefined,
  callPushKind?: string | null
): FcmTerminalKind | null {
  const t = (type ?? "").trim().toLowerCase();
  const k = (callPushKind ?? "").trim().toLowerCase();
  return TERMINAL_TYPE_MAP[t] ?? TERMINAL_TYPE_MAP[k] ?? null;
}

export function isFcmTerminalSignal(
  type: string | null | undefined,
  callPushKind?: string | null
): boolean {
  return resolveFcmTerminalKind(type, callPushKind) != null;
}

export type RawFcmCallPayload = {
  type?: string | null;
  call_push_kind?: string | null;
  callId?: string | null;
  sessionId?: string | null;
};

export function resolveFcmCallId(payload: RawFcmCallPayload): string {
  return (payload.callId ?? payload.sessionId ?? "").trim();
}

/**
 * Normalize raw FCM data into wake_incoming | terminal | ignore.
 * Terminal tombstone on callId → incoming is ignored (late FCM guard).
 */
export function normalizeFcmCallEvent(
  payload: RawFcmCallPayload,
  tombstone: CallTerminalTombstoneContext
): NormalizedFcmCallEvent {
  const fcmType = (payload.type ?? "").trim().toLowerCase() || "unknown";
  const callPushKind = payload.call_push_kind?.trim() || undefined;
  const callId = resolveFcmCallId(payload);

  if (!callId) {
    return { action: "ignore", callId: "", reason: "empty_call_id", fcmType };
  }

  const terminalKind = resolveFcmTerminalKind(fcmType, callPushKind);
  if (terminalKind) {
    return {
      action: "terminal",
      callId,
      terminalKind,
      fcmType,
      callPushKind,
    };
  }

  const isIncoming = fcmType === "incoming_call" || callPushKind === "incoming_call";

  if (isIncoming) {
    if (isCallTerminal(callId, tombstone)) {
      return {
        action: "ignore",
        callId,
        reason: "terminal_tombstone",
        fcmType,
      };
    }
    return {
      action: "wake_incoming",
      callId,
      fcmType,
      callPushKind,
    };
  }

  return { action: "ignore", callId, reason: "unsupported_signal", fcmType };
}
