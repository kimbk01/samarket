/**
 * React context 밖(방·통화 forward nav)에서 stale pending menu intent 를 끊기 위한 브리지.
 * LatestMenuNavigationProvider 가 mount 시 등록한다.
 */

let clearPendingMenuNavigation: ((id?: number) => void) | null = null;

export function registerPendingMenuNavigationClear(fn: (id?: number) => void): () => void {
  clearPendingMenuNavigation = fn;
  return () => {
    if (clearPendingMenuNavigation === fn) {
      clearPendingMenuNavigation = null;
    }
  };
}

export function clearPendingMenuNavigationBridge(id?: number): void {
  try {
    clearPendingMenuNavigation?.(id);
  } catch {
    /* ignore */
  }
}
