"use client";

import { readTerminalCallRecoverySuppress } from "@/lib/community-messenger/call-active-session-recovery";
import {
  clearCallEngineActiveVideoSession,
  clearCallEngineDockedSession,
  clearCallEngineMinimizedSession,
  readCallEngineActiveVideoSession,
  readCallEngineDockedSessionId,
  readCallEngineMinimizedSessionId,
  writeCallEngineActiveVideoSession,
  writeCallEngineDockedSession,
  writeCallEngineMinimizedSession,
} from "@/lib/community-messenger/call-engine";
import { cmCallFlow } from "@/lib/community-messenger/cm-call-debug";

type DetachedCleanup = () => Promise<void>;

let detached: { sessionId: string; cleanup: DetachedCleanup } | null = null;

type CallPresentationLogEvent =
  | "call_presentation_full"
  | "call_presentation_dock"
  | "call_presentation_pip"
  | "call_presentation_expand"
  | "call_presentation_clear"
  | "call_runtime_preserved_on_unmount"
  | "call_runtime_disposed_on_end";

export function logCommunityCallPresentationEvent(
  event: CallPresentationLogEvent,
  extra: Record<string, unknown> = {},
): void {
  cmCallFlow(event, extra);
}

export function attachDetachedCommunityCall(sessionId: string, cleanup: DetachedCleanup): void {
  const sid = sessionId.trim();
  if (!sid) return;
  detached = { sessionId: sid, cleanup };
}

export function takeDetachedCommunityCallCleanup(sessionId: string): DetachedCleanup | null {
  const sid = sessionId.trim();
  if (!sid || !detached || detached.sessionId !== sid) return null;
  const fn = detached.cleanup;
  detached = null;
  return fn;
}

export function resumeDetachedCommunityCall(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid || !detached || detached.sessionId !== sid) return false;
  detached = null;
  return true;
}

export function peekDetachedCommunityCallSessionId(): string | null {
  return detached?.sessionId ?? null;
}

export function readPipMinimizedCallSessionId(): string | null {
  return readCallEngineMinimizedSessionId();
}

export function writePipMinimizedCallSession(sessionId: string, roomId?: string | null): void {
  const sid = sessionId.trim();
  if (!sid) return;
  writeCallEngineMinimizedSession(sid, roomId);
}

export function clearPipMinimizedCallSessionFlags(): void {
  clearCallEngineMinimizedSession();
}

export function readDockedCallSessionId(): string | null {
  return readCallEngineDockedSessionId();
}

export function writeDockedCallSession(sessionId: string, roomId?: string | null): void {
  const sid = sessionId.trim();
  if (!sid) return;
  writeCallEngineDockedSession(sid, roomId);
}

export function clearDockedCallSessionFlags(): void {
  clearCallEngineDockedSession();
}

export function readHostedActiveCallSessionId(): string | null {
  return readCallEngineActiveVideoSession();
}

export function writeHostedActiveCallSession(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  writeCallEngineActiveVideoSession(sid);
}

export function clearHostedActiveCallSession(): void {
  clearCallEngineActiveVideoSession();
}

export function resolveHostedCallPresentation(sessionId: string): "dock" | "pip-minimized" | "fullscreen" | null {
  const sid = sessionId.trim();
  if (!sid) return null;
  if (readDockedCallSessionId() === sid) return "dock";
  if (readPipMinimizedCallSessionId() === sid) return "pip-minimized";
  if (readHostedActiveCallSessionId() === sid) return "fullscreen";
  return null;
}

export function canRetainCommunityCallPresentation(args: {
  status: string | null | undefined;
  sessionMode: string | null | undefined;
  joined: boolean;
}): boolean {
  return args.joined && args.status === "active" && args.sessionMode === "direct";
}

export function dockCommunityCall(args: {
  sessionId: string;
  roomId?: string | null;
  cleanup: DetachedCleanup;
}): void {
  const sid = args.sessionId.trim();
  if (!sid) return;
  attachDetachedCommunityCall(sid, args.cleanup);
  writeDockedCallSession(sid, args.roomId);
  writeHostedActiveCallSession(sid);
  clearPipMinimizedCallSessionFlags();
  logCommunityCallPresentationEvent("call_presentation_dock", {
    sessionId: sid,
    roomId: args.roomId ?? null,
  });
}

export function minimizeCommunityCallToPip(args: {
  sessionId: string;
  roomId?: string | null;
  cleanup: DetachedCleanup;
}): void {
  const sid = args.sessionId.trim();
  if (!sid) return;
  attachDetachedCommunityCall(sid, args.cleanup);
  writePipMinimizedCallSession(sid, args.roomId);
  writeHostedActiveCallSession(sid);
  clearDockedCallSessionFlags();
  logCommunityCallPresentationEvent("call_presentation_pip", {
    sessionId: sid,
    roomId: args.roomId ?? null,
  });
}

export function expandCommunityCallFromDock(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  clearDockedCallSessionFlags();
  writeHostedActiveCallSession(sid);
  resumeDetachedCommunityCall(sid);
  logCommunityCallPresentationEvent("call_presentation_expand", {
    sessionId: sid,
    from: "dock",
  });
  logCommunityCallPresentationEvent("call_presentation_full", { sessionId: sid });
}

export function expandCommunityCallFromPip(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  clearPipMinimizedCallSessionFlags();
  writeHostedActiveCallSession(sid);
  resumeDetachedCommunityCall(sid);
  logCommunityCallPresentationEvent("call_presentation_expand", {
    sessionId: sid,
    from: "pip-minimized",
  });
  logCommunityCallPresentationEvent("call_presentation_full", { sessionId: sid });
}

export async function disposeDetachedCommunityCallIfStale(
  activeSessionIdFromServer: string | null | undefined,
): Promise<void> {
  if (!detached) return;
  const serverSid = activeSessionIdFromServer?.trim() ?? "";
  if (!serverSid || detached.sessionId !== serverSid) {
    const cleanup = detached.cleanup;
    detached = null;
    clearAllCommunityCallLocalSessionFlags();
    await cleanup();
  }
}

export async function forceDisposeDetachedCommunityCall(): Promise<void> {
  if (!detached) return;
  const cleanup = detached.cleanup;
  detached = null;
  clearAllCommunityCallLocalSessionFlags();
  await cleanup();
}

export function clearCommunityCallPresentationFlags(sessionId?: string | null): void {
  const sid = sessionId?.trim() ?? "";
  const clearDock = !sid || readDockedCallSessionId() === sid;
  const clearPip = !sid || readPipMinimizedCallSessionId() === sid;
  if (clearDock) clearDockedCallSessionFlags();
  if (clearPip) clearPipMinimizedCallSessionFlags();
  if (clearDock || clearPip) {
    logCommunityCallPresentationEvent("call_presentation_clear", {
      sessionId: sid || null,
      dock: clearDock,
      pip: clearPip,
    });
  }
}

export function isRetainedCallPresentation(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  return (
    peekDetachedCommunityCallSessionId() === sid ||
    readDockedCallSessionId() === sid ||
    readPipMinimizedCallSessionId() === sid
  );
}

export function isTerminalSuppressedPresentation(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  const suppress = readTerminalCallRecoverySuppress();
  return suppress?.sessionId === sid;
}

export function isHostedActiveOnly(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  if (readHostedActiveCallSessionId() !== sid) return false;
  if (isRetainedCallPresentation(sid)) return false;
  return true;
}

export function shouldSkipCallClientUnmountDispose(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  if (isTerminalSuppressedPresentation(sid)) return false;
  if (isHostedActiveOnly(sid)) return false;
  return isRetainedCallPresentation(sid);
}

export function shouldPreserveCallRuntimeSurfaceOnUnmount(sessionId: string): boolean {
  return shouldSkipCallClientUnmountDispose(sessionId);
}

export function clearAllCommunityCallLocalSessionFlags(): void {
  clearCommunityCallPresentationFlags();
  clearHostedActiveCallSession();
}

export function isCommunityMessengerDedicatedCallSessionPath(
  pathname: string | null | undefined,
  sessionId: string,
): boolean {
  const sid = sessionId.trim();
  if (!pathname?.trim() || !sid) return false;
  const m = pathname.match(/^\/community-messenger\/calls\/([^/?#]+)$/);
  if (!m?.[1]) return false;
  try {
    return decodeURIComponent(m[1]).trim() === sid;
  } catch {
    return m[1].trim() === sid;
  }
}

export function isCallSessionHostedByActiveCallHost(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  return (
    readHostedActiveCallSessionId() === sid ||
    readDockedCallSessionId() === sid ||
    readPipMinimizedCallSessionId() === sid
  );
}

// Legacy aliases
export function readMinimizedCommunityCallSessionId(): string | null {
  return readPipMinimizedCallSessionId();
}

export function writeMinimizedCommunityCallSession(sessionId: string, roomId?: string | null): void {
  writePipMinimizedCallSession(sessionId, roomId);
}

export function clearMinimizedCommunityCallSessionFlags(): void {
  clearPipMinimizedCallSessionFlags();
}

export function writeActiveDirectVideoCallSession(sessionId: string): void {
  writeHostedActiveCallSession(sessionId);
}

export function readActiveDirectVideoCallSessionId(): string | null {
  return readHostedActiveCallSessionId();
}

export function clearActiveDirectVideoCallSession(): void {
  clearHostedActiveCallSession();
}
