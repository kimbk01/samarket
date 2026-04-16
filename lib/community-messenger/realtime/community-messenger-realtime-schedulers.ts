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
