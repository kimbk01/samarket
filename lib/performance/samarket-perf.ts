type PerfPayload = Record<string, unknown>;

const CLIENT_FLAG_KEY = "samarket.perf.log";

function asBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v !== "string") return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "on" || t === "yes";
}

export function perfNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function isClientPerfLogEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const envEnabled = asBool(process.env.NEXT_PUBLIC_SAMARKET_PERF_LOG);
  if (envEnabled) return true;
  const globalEnabled = asBool((window as unknown as { __SAMARKET_PERF_LOG__?: unknown }).__SAMARKET_PERF_LOG__);
  if (globalEnabled) return true;
  try {
    return asBool(window.localStorage.getItem(CLIENT_FLAG_KEY));
  } catch {
    return false;
  }
}

export function logClientPerf(scope: string, payload: PerfPayload): void {
  if (!isClientPerfLogEnabled()) return;
  console.info(`[perf][client][${scope}]`, payload);
}

export function isServerPerfLogEnabled(): boolean {
  return asBool(process.env.SAMARKET_PERF_LOG) || asBool(process.env.CHAT_PERF_LOG);
}

export function logServerPerf(scope: string, payload: PerfPayload): void {
  if (!isServerPerfLogEnabled()) return;
  console.info(`[perf][server][${scope}]`, payload);
}

