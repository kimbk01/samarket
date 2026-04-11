/**
 * 통화 화면(`/community-messenger/calls/[sessionId]`)에서 채팅으로 돌아갈 때
 * Agora 정리를 미루고 보관해 두었다가, 다시 통화 화면에 들어오거나 서버에서 통화가 끝난 뒤 정리한다.
 */
type DetachedCleanup = () => Promise<void>;

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

export function peekDetachedCommunityCallSessionId(): string | null {
  return detached?.sessionId ?? null;
}

/** 서버 스냅샷에 활성 통화가 없는데 로컬에 미니화 연결이 남았을 때 정리 */
export async function disposeDetachedCommunityCallIfStale(activeSessionIdFromServer: string | null | undefined): Promise<void> {
  if (!detached) return;
  if (!activeSessionIdFromServer || detached.sessionId !== activeSessionIdFromServer) {
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem("cm_minimized_call_session");
        sessionStorage.removeItem("cm_minimized_call_room");
      } catch {
        /* ignore */
      }
    }
    try {
      await detached.cleanup();
    } finally {
      detached = null;
    }
  }
}

export async function forceDisposeDetachedCommunityCall(): Promise<void> {
  if (!detached) return;
  try {
    await detached.cleanup();
  } finally {
    detached = null;
  }
}
