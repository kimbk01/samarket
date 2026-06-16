"use client";

import { clearAgoraJoinGuard } from "@/lib/call/actions/agora-join-guard";
import { logDibayCall, sealDibayCallTerminalSurface } from "@/lib/community-messenger/call-orchestrator";
import { endNativeCallService } from "@/lib/call/native/native-call-service";
import { stopCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { stopCallRingtone } from "@/lib/community-messenger/call-ringtone-controller";
import { stopCallHeartbeatWatchdog } from "@/lib/call/native/call-heartbeat-watchdog";
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
  updatedAt: number;
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
  input: Omit<ActiveCallSession, "updatedAt"> & { updatedAt?: number },
  source = "client",
): ActiveCallSession {
  const next: ActiveCallSession = {
    ...input,
    callId: input.callId.trim(),
    roomId: input.roomId?.trim() || null,
    peerUserId: input.peerUserId?.trim() || null,
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
    hardClearActiveCallSession(sid, source);
    return null;
  }
  activeSession = { ...activeSession, phase, updatedAt: Date.now() };
  notifySync();
  return activeSession;
}

export function resumeActiveCallSessionFromNative(
  input: Omit<ActiveCallSession, "updatedAt">,
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

/** terminal — notification·ringtone·route·native·heartbeat 일괄 정리 */
export async function hardClearActiveCallSession(
  callId: string | null | undefined,
  reason = "terminal",
): Promise<void> {
  const sid = callId?.trim() ?? activeSession?.callId?.trim() ?? "";
  if (!sid) {
    activeSession = null;
    notifySync();
    return;
  }
  logDibayCall("active_session_hard_clear", {
    sessionId: sid,
    callId: sid,
    reason,
  });
  activeSession = null;
  stopCallHeartbeatWatchdog(sid);
  stopCallRingtone("active_session_hard_clear", sid);
  stopCommunityMessengerCallTone();
  clearAgoraJoinGuard(sid);
  sealDibayCallTerminalSurface(sid);
  await endNativeCallService(sid, reason);
  notifySync();
}

export function resetActiveCallSessionForTests(): void {
  activeSession = null;
}
