import type { MutableRefObject } from "react";

export function createRefreshScheduler(callbackRef: MutableRefObject<() => void>, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      callbackRef.current();
    }, delayMs);
  };
  const cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  return { schedule, cancel };
}

/**
 * Trailing debounce — each schedule() resets the window.
 * CUT-B: open-room same-purpose catch-up (session terminal + downstream log/stub/rooms).
 */
export function createTrailingRefreshScheduler(
  run: () => void,
  options?: {
    coalesceMs?: number;
    isCancelled?: () => boolean;
  }
): {
  schedule: () => void;
  cancel: () => void;
  hasPending: () => boolean;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const coalesceMs = Math.max(0, Math.floor(Number(options?.coalesceMs ?? 0) || 0));
  const schedule = () => {
    if (options?.isCancelled?.()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (options?.isCancelled?.()) return;
      run();
    }, coalesceMs);
  };
  const cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  return {
    schedule,
    cancel,
    hasPending: () => timer != null,
  };
}
