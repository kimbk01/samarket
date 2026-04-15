export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
};

function mergeSignals(primary?: AbortSignal | null, secondary?: AbortSignal | null): AbortSignal | undefined {
  const a = primary ?? undefined;
  const b = secondary ?? undefined;
  if (!a) return b;
  if (!b) return a;
  // AbortSignal.any is available on modern runtimes; fallback to a linked controller.
  const any = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === "function") return any([a, b]);
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return ac.signal;
}

export async function fetchWithTimeout(input: RequestInfo | URL, options: FetchWithTimeoutOptions = {}) {
  const { timeoutMs = 12_000, signal, ...rest } = options;

  const hasTimeout =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs < 10 * 60_000;

  const timeoutSignal =
    hasTimeout && typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
      ? (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(timeoutMs)
      : null;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timerController = hasTimeout && !timeoutSignal ? new AbortController() : null;
  if (hasTimeout && timerController) {
    timer = setTimeout(() => timerController.abort(), timeoutMs);
  }

  try {
    const merged = mergeSignals(signal ?? null, timeoutSignal ?? timerController?.signal ?? null);
    return await fetch(input, { ...rest, signal: merged });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

