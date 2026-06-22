"use client";

import { readTerminalCallRecoverySuppress } from "@/lib/community-messenger/call-active-session-recovery";
import {
  clearCallEngineActiveVideoSession,
  clearCallEngineAndroidOsPipSession,
  clearCallEngineDockedSession,
  clearCallEngineIosNativePipSession,
  clearCallEngineMinimizedSession,
  readCallEngineActiveVideoSession,
  readCallEngineAndroidOsPipSessionId,
  readCallEngineDockedSessionId,
  readCallEngineIosNativePipSessionId,
  readCallEngineMinimizedSessionId,
  writeCallEngineActiveVideoSession,
  writeCallEngineAndroidOsPipSession,
  writeCallEngineDockedSession,
  writeCallEngineIosNativePipSession,
  writeCallEngineMinimizedSession,
} from "@/lib/community-messenger/call-engine";
import type { CallPresentationSurface } from "@/lib/community-messenger/call-presentation-surface";
import { resolveCallPresentationSurface } from "@/lib/community-messenger/call-presentation-surface";
import { cmCallFlow } from "@/lib/community-messenger/cm-call-debug";

type DetachedCleanup = () => Promise<void>;

let detached: { sessionId: string; cleanup: DetachedCleanup } | null = null;

type CallPresentationLogEvent =
  | "call_presentation_full"
  | "call_presentation_dock"
  | "call_presentation_pip"
  | "call_presentation_android_os_pip"
  | "call_presentation_ios_native_pip"
  | "call_presentation_expand"
  | "call_presentation_clear"
  | "call_runtime_preserved_on_unmount"
  | "call_runtime_disposed_on_end";

export type { CallPresentationSurface };
export { resolveCallPresentationSurface };

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

export function resolveHostedCallPresentation(
  sessionId: string
): "dock" | "pip-minimized" | "android-os-pip" | "ios-native-pip" | "fullscreen" | null {
  const sid = sessionId.trim();
  if (!sid) return null;
  if (readCallEngineAndroidOsPipSessionId() === sid) return "android-os-pip";
  if (readCallEngineIosNativePipSessionId() === sid) return "ios-native-pip";
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
  clearAndroidOsPipCallSessionFlags();
  clearIosNativePipCallSessionFlags();
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
  clearAndroidOsPipCallSessionFlags();
  clearIosNativePipCallSessionFlags();
  logCommunityCallPresentationEvent("call_presentation_pip", {
    sessionId: sid,
    roomId: args.roomId ?? null,
  });
}

export function enterAndroidOsPipCommunityCall(args: {
  sessionId: string;
  roomId?: string | null;
  cleanup: DetachedCleanup;
}): void {
  const sid = args.sessionId.trim();
  if (!sid) return;
  attachDetachedCommunityCall(sid, args.cleanup);
  writeCallEngineAndroidOsPipSession(sid);
  writeHostedActiveCallSession(sid);
  clearDockedCallSessionFlags();
  clearPipMinimizedCallSessionFlags();
  clearIosNativePipCallSessionFlags();
  logCommunityCallPresentationEvent("call_presentation_android_os_pip", { sessionId: sid });
}

export function exitAndroidOsPipCommunityCall(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  if (readCallEngineAndroidOsPipSessionId() !== sid) return;
  clearAndroidOsPipCallSessionFlags();
  writeHostedActiveCallSession(sid);
  resumeDetachedCommunityCall(sid);
  logCommunityCallPresentationEvent("call_presentation_full", { sessionId: sid, from: "android-os-pip" });
}

export function readAndroidOsPipCallSessionId(): string | null {
  return readCallEngineAndroidOsPipSessionId();
}

export function clearAndroidOsPipCallSessionFlags(): void {
  clearCallEngineAndroidOsPipSession();
}

export function readIosNativePipCallSessionId(): string | null {
  return readCallEngineIosNativePipSessionId();
}

export function clearIosNativePipCallSessionFlags(): void {
  clearCallEngineIosNativePipSession();
}

export function expandCommunityCallFromDock(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  clearDockedCallSessionFlags();
  clearPipMinimizedCallSessionFlags();
  clearAndroidOsPipCallSessionFlags();
  clearIosNativePipCallSessionFlags();
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
  clearDockedCallSessionFlags();
  clearAndroidOsPipCallSessionFlags();
  clearIosNativePipCallSessionFlags();
  writeHostedActiveCallSession(sid);
  resumeDetachedCommunityCall(sid);
  logCommunityCallPresentationEvent("call_presentation_expand", {
    sessionId: sid,
    from: "pip-minimized",
  });
  logCommunityCallPresentationEvent("call_presentation_full", { sessionId: sid });
}

export function expandCommunityCallFromAndroidOsPip(sessionId: string): void {
  exitAndroidOsPipCommunityCall(sessionId);
  logCommunityCallPresentationEvent("call_presentation_expand", {
    sessionId: sessionId.trim(),
    from: "android-os-pip",
  });
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
  const clearAndroidPip = !sid || readCallEngineAndroidOsPipSessionId() === sid;
  const clearIosPip = !sid || readCallEngineIosNativePipSessionId() === sid;
  if (clearDock) clearDockedCallSessionFlags();
  if (clearPip) clearPipMinimizedCallSessionFlags();
  if (clearAndroidPip) clearAndroidOsPipCallSessionFlags();
  if (clearIosPip) clearIosNativePipCallSessionFlags();
  if (clearDock || clearPip || clearAndroidPip || clearIosPip) {
    logCommunityCallPresentationEvent("call_presentation_clear", {
      sessionId: sid || null,
      dock: clearDock,
      pip: clearPip,
      androidOsPip: clearAndroidPip,
      iosNativePip: clearIosPip,
    });
  }
}

export function isRetainedCallPresentation(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  const surface = resolveCallPresentationSurface(sid);
  return (
    surface === "DOCK" ||
    surface === "ANDROID_OS_PIP" ||
    surface === "IOS_NATIVE_PIP" ||
    peekDetachedCommunityCallSessionId() === sid
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
  return resolveCallPresentationSurface(sid) !== "NONE";
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
