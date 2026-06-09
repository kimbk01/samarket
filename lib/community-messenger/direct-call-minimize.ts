/**
 * 통화 화면(`/community-messenger/calls/[sessionId]`)에서 PiP·다른 화면으로 이동할 때
 * Agora 정리를 미루고 보관해 두었다가, 전체화면 복귀·서버 종료·로그아웃 시 정리한다.
 */
type DetachedCleanup = () => Promise<void>;

const MINIMIZED_SESSION_KEY = "cm_minimized_call_session";
const MINIMIZED_ROOM_KEY = "cm_minimized_call_room";
const ACTIVE_VIDEO_CALL_KEY = "cm_active_direct_video_call_session";

let detached: { sessionId: string; cleanup: DetachedCleanup } | null = null;

export function attachDetachedCommunityCall(sessionId: string, cleanup: DetachedCleanup): void {
  detached = { sessionId, cleanup };
}

export function takeDetachedCommunityCallCleanup(sessionId: string): DetachedCleanup | null {
  if (!detached || detached.sessionId !== sessionId) return null;
  const fn = detached.cleanup;
  detached = null;
  return fn;
}

/** 전체화면 복귀 — detach 해제만 하고 cleanup 은 실행하지 않음 */
export function resumeDetachedCommunityCall(sessionId: string): boolean {
  if (!detached || detached.sessionId !== sessionId) return false;
  detached = null;
  return true;
}

export function peekDetachedCommunityCallSessionId(): string | null {
  return detached?.sessionId ?? null;
}

export function readMinimizedCommunityCallSessionId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const sid = sessionStorage.getItem(MINIMIZED_SESSION_KEY)?.trim();
    return sid || null;
  } catch {
    return null;
  }
}

export function writeMinimizedCommunityCallSession(sessionId: string, roomId?: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(MINIMIZED_SESSION_KEY, sessionId.trim());
    const room = roomId?.trim();
    if (room) sessionStorage.setItem(MINIMIZED_ROOM_KEY, room);
  } catch {
    /* ignore */
  }
}

export function clearMinimizedCommunityCallSessionFlags(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(MINIMIZED_SESSION_KEY);
    sessionStorage.removeItem(MINIMIZED_ROOM_KEY);
  } catch {
    /* ignore */
  }
}

export function minimizeCommunityCallToPip(args: {
  sessionId: string;
  roomId?: string | null;
  cleanup: DetachedCleanup;
}): void {
  attachDetachedCommunityCall(args.sessionId, args.cleanup);
  writeMinimizedCommunityCallSession(args.sessionId, args.roomId);
}

/** 서버 스냅샷에 활성 통화가 없는데 로컬에 미니화 연결이 남았을 때 정리 */
export async function disposeDetachedCommunityCallIfStale(
  activeSessionIdFromServer: string | null | undefined
): Promise<void> {
  if (!detached) return;
  if (!activeSessionIdFromServer || detached.sessionId !== activeSessionIdFromServer) {
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

export function shouldSkipCallClientUnmountDispose(sessionId: string): boolean {
  return peekDetachedCommunityCallSessionId() === sessionId.trim();
}

export function writeActiveDirectVideoCallSession(sessionId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(ACTIVE_VIDEO_CALL_KEY, sessionId.trim());
  } catch {
    /* ignore */
  }
}

export function readActiveDirectVideoCallSessionId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const sid = sessionStorage.getItem(ACTIVE_VIDEO_CALL_KEY)?.trim();
    return sid || null;
  } catch {
    return null;
  }
}

export function clearActiveDirectVideoCallSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(ACTIVE_VIDEO_CALL_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAllCommunityCallLocalSessionFlags(): void {
  clearMinimizedCommunityCallSessionFlags();
  clearActiveDirectVideoCallSession();
}
