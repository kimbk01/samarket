"use client";

import { clearAgoraJoinGuard } from "@/lib/call/actions/agora-join-guard";
import { logDibayCall, sealDibayCallTerminalSurface } from "@/lib/community-messenger/call-orchestrator";
import { appendDibayCallQaLog } from "@/lib/call/qa/dibay-call-qa-log";
import { stopCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { stopCallRingtone } from "@/lib/community-messenger/call-ringtone-controller";
import { stopCallHeartbeatWatchdog } from "@/lib/call/native/call-heartbeat-watchdog";
import { endNativeCallService, reportNativeCallRemoteEnded } from "@/lib/call/native/native-call-service";
import {
  canCleanupActiveCall,
  mapLegacyPhaseToMachine,
  mapMachinePhaseToLegacy,
  transitionMachinePhase,
  type ActiveCallSessionMachinePhase,
} from "@/lib/call/active-call-session-machine";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/** 제품 라이프사이클 — callId 기준 단일 activeCallSession */
export type ActiveCallSessionPhase =
  | "idle"
  | "dialing"
  | "ringing"
  | "connecting"
  | "active"
  | "ending"
  | "ended"
  | "missed"
  | "failed";

export type ActiveCallSessionRole = "caller" | "callee";

export type ActiveCallSession = {
  callId: string;
  roomId: string | null;
  peerUserId: string | null;
  role: ActiveCallSessionRole;
  mediaType: CommunityMessengerCallKind;
  phase: Exclude<ActiveCallSessionPhase, "idle">;
  /** P4 machine phase — session SSOT for lifecycle */
  machinePhase: ActiveCallSessionMachinePhase;
  connected: boolean;
  updatedAt: number;
};

export type ActiveCallSessionInput = Omit<ActiveCallSession, "updatedAt" | "machinePhase" | "connected"> & {
  machinePhase?: ActiveCallSessionMachinePhase;
  connected?: boolean;
  updatedAt?: number;
};

const LIVE_PHASES = new Set<ActiveCallSessionPhase>([
  "dialing",
  "ringing",
  "connecting",
  "active",
  "ending",
]);

const TERMINAL_PHASES = new Set<ActiveCallSessionPhase>(["ended", "missed", "failed", "idle"]);

const SYNC_EVENT = "dibay:active-call-session-sync";

let activeSession: ActiveCallSession | null = null;

function notifySync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SYNC_EVENT));
}

export function subscribeActiveCallSession(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

export function readActiveCallSessionSnapshot(): ActiveCallSession | null {
  return activeSession;
}

export function isLiveActiveCallPhase(phase: ActiveCallSessionPhase | null | undefined): boolean {
  return phase != null && LIVE_PHASES.has(phase);
}

export function getActiveCallSessionCallId(): string | null {
  const phase = activeSession?.phase;
  if (!activeSession || !phase || TERMINAL_PHASES.has(phase)) return null;
  return activeSession.callId;
}

export function setActiveCallSession(
  input: ActiveCallSessionInput,
  source = "client",
): ActiveCallSession {
  const machinePhase =
    input.machinePhase ??
    mapLegacyPhaseToMachine(input.phase, input.connected ?? input.phase === "active");
  const next: ActiveCallSession = {
    ...input,
    callId: input.callId.trim(),
    roomId: input.roomId?.trim() || null,
    peerUserId: input.peerUserId?.trim() || null,
    connected: input.connected ?? input.phase === "active",
    machinePhase,
    updatedAt: input.updatedAt ?? Date.now(),
  };
  const created = !activeSession || activeSession.callId !== next.callId;
  activeSession = next;
  if (created) {
    logDibayCall("active_session_create", {
      sessionId: next.callId,
      callId: next.callId,
      phase: next.phase,
      role: next.role,
      source,
    });
  }
  notifySync();
  return next;
}

export function patchActiveCallSessionPhase(
  callId: string,
  phase: ActiveCallSessionPhase,
  source = "client",
): ActiveCallSession | null {
  const sid = callId.trim();
  if (!sid || !activeSession || activeSession.callId !== sid) return null;
  if (phase === "idle") {
    void releaseLocalCallSession(sid, source);
    return null;
  }
  const machinePhase = transitionMachinePhase(
    activeSession.machinePhase,
    mapLegacyPhaseToMachine(phase, activeSession.connected),
  );
  activeSession = {
    ...activeSession,
    phase,
    machinePhase,
    updatedAt: Date.now(),
  };
  notifySync();
  return activeSession;
}

export function patchActiveCallSessionMachinePhase(
  callId: string,
  machinePhase: ActiveCallSessionMachinePhase,
  source = "client",
): ActiveCallSession | null {
  const sid = callId.trim();
  if (!sid || !activeSession || activeSession.callId !== sid) return null;
  const prev = activeSession.machinePhase;
  const nextPhase = transitionMachinePhase(prev, machinePhase);
  if (nextPhase !== machinePhase && prev !== machinePhase) {
    logDibayCall("active_call_machine_transition_blocked", {
      sessionId: sid,
      callId: sid,
      from: prev,
      to: machinePhase,
      source,
    });
  }
  activeSession = {
    ...activeSession,
    machinePhase: nextPhase,
    phase:
      mapMachinePhaseToLegacy(nextPhase) === "idle"
        ? activeSession.phase
        : (mapMachinePhaseToLegacy(nextPhase) as Exclude<ActiveCallSessionPhase, "idle">),
    connected: nextPhase === "CONNECTED" || activeSession.connected,
    updatedAt: Date.now(),
  };
  if (prev !== nextPhase) {
    const lifecycleStep =
      nextPhase === "BACKGROUNDED"
        ? "call_lifecycle_background_keep_alive"
        : nextPhase === "SCREEN_OFF_ACTIVE"
          ? "call_lifecycle_screen_off_keep_alive"
          : nextPhase === "RECONNECTING"
            ? "media_reconnecting"
            : nextPhase === "CONNECTED" && prev === "RECONNECTING"
              ? "media_reconnected"
              : null;
    if (lifecycleStep) {
      appendDibayCallQaLog({
        step: lifecycleStep,
        callId: sid,
        phase: nextPhase,
        extra: { from: prev, source },
      });
    }
    appendDibayCallQaLog({
      step: "active_call_machine_phase",
      callId: sid,
      phase: nextPhase,
      extra: { from: prev, source },
    });
  }
  notifySync();
  return activeSession;
}

export function resumeActiveCallSessionFromNative(
  input: ActiveCallSessionInput,
  source = "native_resume",
): ActiveCallSession {
  const session = setActiveCallSession(input, source);
  logDibayCall("active_session_resume_from_native", {
    sessionId: session.callId,
    callId: session.callId,
    phase: session.phase,
    source,
  });
  return session;
}

/** SSOT_CONTRACT: cm-call-lifecycle-local-release releaseLocalCallSession peer PATCH 금지 */
export async function releaseLocalCallSession(
  callId: string | null | undefined,
  reason = "terminal",
  options?: { alternateId?: string | null },
): Promise<void> {
  const primary = callId?.trim() ?? "";
  const alternate = options?.alternateId?.trim() ?? "";
  const activeId = activeSession?.callId?.trim() ?? "";
  const sid = primary || alternate || activeId;

  if (!activeSession) {
    if (!sid) {
      notifySync();
      return;
    }
    if (!canCleanupActiveCall(reason)) {
      logDibayCall("active_call_cleanup_blocked", {
        sessionId: sid,
        callId: sid,
        reason,
      });
      return;
    }
    await runActiveCallSessionNativeTeardown(sid, reason);
    notifySync();
    return;
  }

  const idMatches =
    !primary ||
    activeId === primary ||
    (alternate && activeId === alternate);
  const forceTerminalClear = canCleanupActiveCall(reason);

  if (!idMatches && isLiveActiveCallPhase(activeSession.phase) && !forceTerminalClear) {
    logDibayCall("active_call_cleanup_blocked", {
      sessionId: activeId,
      callId: primary || alternate,
      reason,
      detail: "id_mismatch",
    });
    return;
  }

  if (!canCleanupActiveCall(reason)) {
    logDibayCall("active_call_cleanup_blocked", {
      sessionId: activeId,
      callId: primary || activeId,
      reason,
    });
    return;
  }

  const clearId = activeId || sid;
  logDibayCall("active_session_hard_clear", {
    sessionId: clearId,
    callId: clearId,
    reason,
  });
  appendDibayCallQaLog({
    step: "active_call_cleanup",
    callId: clearId,
    cleanupReason: reason,
    reason,
  });
  activeSession = null;
  await runActiveCallSessionNativeTeardown(clearId, reason);
  notifySync();
}

async function runActiveCallSessionNativeTeardown(callId: string, reason: string): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  stopCallHeartbeatWatchdog(sid);
  stopCallRingtone("active_session_hard_clear", sid);
  stopCommunityMessengerCallTone();
  clearAgoraJoinGuard(sid);
  sealDibayCallTerminalSurface(sid);
  const normalizedReason = reason.trim().toLowerCase();
  const isRemoteNativeEnd =
    normalizedReason === "remote_ended" ||
    normalizedReason === "remote_cancelled" ||
    normalizedReason === "remote_rejected" ||
    normalizedReason === "remote_missed" ||
    normalizedReason === "native_stale_terminal" ||
    normalizedReason === "recovery_no_live_session" ||
    normalizedReason === "ended" ||
    normalizedReason === "rejected" ||
    normalizedReason === "cancelled" ||
    normalizedReason === "missed";
  if (isRemoteNativeEnd) {
    await reportNativeCallRemoteEnded(sid);
  } else {
    await endNativeCallService(sid, reason);
  }
}

/** @deprecated — releaseLocalCallSession 사용 */
export async function hardClearActiveCallSession(
  callId: string | null | undefined,
  reason = "terminal",
  options?: { alternateId?: string | null },
): Promise<void> {
  await releaseLocalCallSession(callId, reason, options);
}

export function resetActiveCallSessionForTests(): void {
  activeSession = null;
}
