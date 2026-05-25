/**
 * 동일 burst 내 trailing 1회만 실행 — Realtime·CustomEvent 연쇄 fetch 완화.
 */
export function createTrailingCoalescedCallback(
  fn: () => void,
  delayMs: number
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delayMs);
  };

  return { schedule, cancel };
}
