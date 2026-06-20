"use client";

import { readTerminalCallRecoverySuppress } from "@/lib/community-messenger/call-active-session-recovery";

/**
 * 통화 화면(`/community-messenger/calls/[sessionId]`)에서 fullscreen·dock·PiP 전환 시
 * Agora cleanup 타이밍을 제어하고, ActiveCallHost 소유 상태를 단일 SSOT로 관리한다.
 */
type DetachedCleanup = () => Promise<void>;

const PIP_MINIMIZED_SESSION_KEY = "cm_minimized_call_session";
const PIP_MINIMIZED_ROOM_KEY = "cm_minimized_call_room";
const DOCKED_SESSION_KEY = "cm_docked_call_session";
const DOCKED_ROOM_KEY = "cm_docked_call_room";
const HOSTED_ACTIVE_SESSION_KEY = "cm_active_direct_video_call_session";

let detached: { sessionId: string; cleanup: DetachedCleanup } | null = null;

function readSessionStorageValue(key: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const value = sessionStorage.getItem(key)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function writeSessionStorageValue(key: string, value: string | null | undefined): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const v = value?.trim();
    if (v) {
      sessionStorage.setItem(key, v);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
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

/** 전체화면 복귀 — detach 해제만 하고 cleanup 은 실행하지 않음 */
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
  return readSessionStorageValue(PIP_MINIMIZED_SESSION_KEY);
}

export function writePipMinimizedCallSession(sessionId: string, roomId?: string | null): void {
  const sid = sessionId.trim();
  if (!sid) return;
  writeSessionStorageValue(PIP_MINIMIZED_SESSION_KEY, sid);
  writeSessionStorageValue(PIP_MINIMIZED_ROOM_KEY, roomId ?? null);
}

export function clearPipMinimizedCallSessionFlags(): void {
  writeSessionStorageValue(PIP_MINIMIZED_SESSION_KEY, null);
  writeSessionStorageValue(PIP_MINIMIZED_ROOM_KEY, null);
}

export function readDockedCallSessionId(): string | null {
  return readSessionStorageValue(DOCKED_SESSION_KEY);
}

export function writeDockedCallSession(sessionId: string, roomId?: string | null): void {
  const sid = sessionId.trim();
  if (!sid) return;
  writeSessionStorageValue(DOCKED_SESSION_KEY, sid);
  writeSessionStorageValue(DOCKED_ROOM_KEY, roomId ?? null);
}

export function clearDockedCallSessionFlags(): void {
  writeSessionStorageValue(DOCKED_SESSION_KEY, null);
  writeSessionStorageValue(DOCKED_ROOM_KEY, null);
}

export function readHostedActiveCallSessionId(): string | null {
  return readSessionStorageValue(HOSTED_ACTIVE_SESSION_KEY);
}

export function writeHostedActiveCallSession(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  writeSessionStorageValue(HOSTED_ACTIVE_SESSION_KEY, sid);
}

export function clearHostedActiveCallSession(): void {
  writeSessionStorageValue(HOSTED_ACTIVE_SESSION_KEY, null);
}

export function resolveHostedCallPresentation(sessionId: string): "dock" | "pip-minimized" | "fullscreen" | null {
  const sid = sessionId.trim();
  if (!sid) return null;
  if (readDockedCallSessionId() === sid) return "dock";
  if (readPipMinimizedCallSessionId() === sid) return "pip-minimized";
  if (readHostedActiveCallSessionId() === sid) return "fullscreen";
  return null;
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
}

export function expandCommunityCallFromDock(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  clearDockedCallSessionFlags();
  writeHostedActiveCallSession(sid);
  resumeDetachedCommunityCall(sid);
}

export function expandCommunityCallFromPip(sessionId: string): void {
  const sid = sessionId.trim();
  if (!sid) return;
  clearPipMinimizedCallSessionFlags();
  writeHostedActiveCallSession(sid);
  resumeDetachedCommunityCall(sid);
}

/** 서버 스냅샷에 활성 통화가 없는데 로컬에 dock/pip 연결이 남았을 때 정리 */
export async function disposeDetachedCommunityCallIfStale(
  activeSessionIdFromServer: string | null | undefined
): Promise<void> {
  if (!detached) return;
  const serverSid = activeSessionIdFromServer?.trim() ?? "";
  if (!serverSid || detached.sessionId !== serverSid) {
    clearAllCommunityCallLocalSessionFlags();
    try {
      await detached.cleanup();
    } finally {
      detached = null;
    }
  }
}

export async function forceDisposeDetachedCommunityCall(): Promise<void> {
  if (!detached) return;
  clearAllCommunityCallLocalSessionFlags();
  try {
    await detached.cleanup();
  } finally {
    detached = null;
  }
}

export function clearCommunityCallPresentationFlags(): void {
  clearDockedCallSessionFlags();
  clearPipMinimizedCallSessionFlags();
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

/**
 * hostedActive is not a retention reason after terminal.
 * unmount dispose skip 은 detached/dock/pip retained 상태에서만 허용한다.
 */
export function shouldSkipCallClientUnmountDispose(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  if (isTerminalSuppressedPresentation(sid)) return false;
  if (isHostedActiveOnly(sid)) return false;
  return isRetainedCallPresentation(sid);
}

export function clearAllCommunityCallLocalSessionFlags(): void {
  clearCommunityCallPresentationFlags();
  clearHostedActiveCallSession();
}

/**
 * `/community-messenger/calls/:sessionId` 전용 라우트 — 이 경로의 CallClient 가 단일 소유자.
 * (host 소유와 중복 마운트·이중 Agora 조인 방지)
 */
export function isCommunityMessengerDedicatedCallSessionPath(
  pathname: string | null | undefined,
  sessionId: string
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

/** ActiveCallHost 가 CallClient 를 상주시키는 세션인지 */
export function isCallSessionHostedByActiveCallHost(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  return (
    readHostedActiveCallSessionId() === sid ||
    readDockedCallSessionId() === sid ||
    readPipMinimizedCallSessionId() === sid
  );
}

/**
 * Legacy alias: 기존 minimize 명명 호환.
 * `minimized`는 앞으로 `pip-minimized` 의미로만 사용한다.
 */
export function readMinimizedCommunityCallSessionId(): string | null {
  return readPipMinimizedCallSessionId();
}

/** Legacy alias */
export function writeMinimizedCommunityCallSession(sessionId: string, roomId?: string | null): void {
  writePipMinimizedCallSession(sessionId, roomId);
}

/** Legacy alias */
export function clearMinimizedCommunityCallSessionFlags(): void {
  clearPipMinimizedCallSessionFlags();
}

/** Legacy alias */
export function writeActiveDirectVideoCallSession(sessionId: string): void {
  writeHostedActiveCallSession(sessionId);
}

/** Legacy alias */
export function readActiveDirectVideoCallSessionId(): string | null {
  return readHostedActiveCallSessionId();
}

/** Legacy alias */
export function clearActiveDirectVideoCallSession(): void {
  clearHostedActiveCallSession();
}
