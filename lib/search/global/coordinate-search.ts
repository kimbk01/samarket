/**
 * Global Search query coordination only.
 * Domain ranking / fields / eligibility / membership stay in adapters.
 */

export const GLOBAL_SEARCH_DEBOUNCE_MS = 250;

export function trimGlobalSearchQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

export function createGlobalSearchCoordinator(debounceMs = GLOBAL_SEARCH_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  let abort: AbortController | null = null;

  const cancelInFlight = () => {
    abort?.abort();
    abort = null;
  };

  const clearTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    nextSeq(): number {
      seq += 1;
      return seq;
    },
    isCurrent(requestSeq: number): boolean {
      return requestSeq === seq;
    },
    beginRequest(): { signal: AbortSignal; seq: number } {
      cancelInFlight();
      abort = new AbortController();
      const requestSeq = ++seq;
      return { signal: abort.signal, seq: requestSeq };
    },
    schedule(run: () => void) {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        run();
      }, debounceMs);
    },
    cancel() {
      clearTimer();
      cancelInFlight();
      seq += 1;
    },
  };
}
