/**
 * React context 밖(방 forward nav)에서 dual-panel push session 을 끊기 위한 브리지.
 * AppRouteTransition 이 mount 시 등록한다.
 */

let abortMainShellPushSession: (() => void) | null = null;

export function registerMainShellPushSessionAbort(fn: () => void): () => void {
  abortMainShellPushSession = fn;
  return () => {
    if (abortMainShellPushSession === fn) {
      abortMainShellPushSession = null;
    }
  };
}

export function abortMainShellPushSessionBridge(): void {
  try {
    abortMainShellPushSession?.();
  } catch {
    /* ignore */
  }
}
