/** 로컬에서만 — Network·프리패치 큐 동작 확인용 (`NEXT_PUBLIC_MESSENGER_PREFETCH_TRACE=1`) */

export function isMessengerPrefetchTraceEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESSENGER_PREFETCH_TRACE === "1";
}

export function prefetchTrace(tag: string, payload?: Record<string, unknown>): void {
  if (!isMessengerPrefetchTraceEnabled()) return;
  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info(`[cm_prefetch:${tag}]`, payload ?? "");
  }
}
