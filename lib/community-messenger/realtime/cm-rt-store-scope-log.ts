"use client";

export type CmRtStoreScopeLogPayload = {
  eventType: string;
  wroteActiveMessages?: boolean;
  wroteRuntimeState?: boolean;
  wroteHomeListBlocked?: boolean;
  activeRoomId?: string | null;
  durationMs?: number;
};

function rtStoreScopeTraceEnabled(): boolean {
  try {
    return (
      process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_RT_STORE_SCOPE === "1" ||
      process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1" ||
      process.env.SAMARKET_MESSENGER_TRACE_LOG === "1"
    );
  } catch {
    return false;
  }
}

/** R2-M2 — Zustand realtime store scope (dev/trace only, no production spam) */
export function cmRtStoreScopeLog(payload: CmRtStoreScopeLogPayload): void {
  if (!rtStoreScopeTraceEnabled()) return;
  if (process.env.NODE_ENV === "production" && process.env.SAMARKET_MESSENGER_TRACE_LOG !== "1") {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug("[cm-rt-store-scope]", payload);
}
