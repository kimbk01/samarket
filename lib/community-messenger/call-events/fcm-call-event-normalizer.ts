/**
 * FCM call event normalizer — signal only, not state.
 * See docs/community-messenger/incoming-call-ssot.md
 */
import {
  type CallTerminalTombstoneContext,
  isCallTerminal,
} from "@/lib/community-messenger/call-state/call-terminal-tombstone";
import type { CallConsumedReason } from "@/lib/community-messenger/incoming-call/tombstone";
import { sealIncomingCallTerminal } from "@/lib/community-messenger/incoming-call/terminal";

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
  /** Native `call_terminal` inject — maps to terminal kind */
  status?: string | null;
};

export type NormalizedFcmTerminalDispatch = {
  callId: string;
  terminalKind: FcmTerminalKind;
  fcmType: string;
  bridgeSource: "call_terminal" | "call_canceled";
};

function mapSessionStatusToTerminalKind(status: string): FcmTerminalKind {
  const s = status.trim().toLowerCase();
  if (s === "rejected") return "rejected";
  if (s === "missed") return "missed";
  if (s === "ended") return "ended";
  return "cancelled";
}

export function fcmTerminalKindToConsumedReason(kind: FcmTerminalKind): CallConsumedReason {
  switch (kind) {
    case "rejected":
      return "declined";
    case "missed":
      return "missed";
    case "ended":
      return "ended";
    case "cancelled":
    default:
      return "cancelled";
  }
}

export function fcmTerminalKindToSessionStatus(kind: FcmTerminalKind): string {
  if (kind === "rejected") return "rejected";
  if (kind === "missed") return "missed";
  if (kind === "ended") return "ended";
  return "cancelled";
}

/** `dibay:call-event` detail → normalized FCM event (no tombstone gate on terminal). */
export function normalizeDibayBridgeCallEvent(detail: {
  type?: string | null;
  sessionId?: string | null;
  status?: string | null;
}): NormalizedFcmCallEvent {
  const type = (detail.type ?? "").trim();
  return normalizeFcmCallEvent(
    {
      type,
      sessionId: detail.sessionId,
      status: detail.status,
    },
    { hardClearedAt: new Map() }
  );
}

/** normalizeFcmCallEvent(terminal) → sealIncomingCallTerminal */
export function sealFcmTerminalEvent(
  normalized: Extract<NormalizedFcmCallEvent, { action: "terminal" }>,
  hardClearedAt: Map<string, number>,
  source: string
): string {
  return sealIncomingCallTerminal(
    normalized.callId,
    fcmTerminalKindToConsumedReason(normalized.terminalKind),
    hardClearedAt,
    source
  );
}

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

  if (fcmType === "call_terminal") {
    const status = (payload.status ?? "cancelled").trim().toLowerCase() || "cancelled";
    return {
      action: "terminal",
      callId,
      terminalKind: mapSessionStatusToTerminalKind(status),
      fcmType,
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

export type IncomingCallWakeResolution =
  | { proceed: true; callId: string }
  | { proceed: false; callId: string; reason: "terminal_tombstone" | "native_consumed" | "empty_call_id" };

export function buildCallTombstoneContext(
  hardClearedAt: Map<string, number>
): CallTerminalTombstoneContext {
  return { hardClearedAt };
}

/** FCM/SW incoming wake — normalize tombstone then optional native consumed check. */
export async function resolveIncomingCallWake(
  callId: string,
  tombstone: CallTerminalTombstoneContext,
  isNativeConsumed: (sessionId: string) => Promise<boolean>
): Promise<IncomingCallWakeResolution> {
  const sid = callId.trim();
  if (!sid) return { proceed: false, callId: "", reason: "empty_call_id" };

  const normalized = normalizeFcmCallEvent({ type: "incoming_call", callId: sid }, tombstone);
  if (normalized.action === "ignore") {
    return { proceed: false, callId: sid, reason: "terminal_tombstone" };
  }

  if (await isNativeConsumed(sid)) {
    return { proceed: false, callId: sid, reason: "native_consumed" };
  }

  return { proceed: true, callId: sid };
}
