/**
 * 클라이언트 fetch 관측 — `console.info` 한 줄 JSON (red error 아님).
 * APP-Shell·bootstrap 구조와 무관한 로깅 전용.
 */

export type FetchClientTelemetryEvent =
  | "fetch_abort"
  | "auth_401"
  | "stale_response_ignored"
  | "fetch_network_retry";

export function logFetchClientTelemetry(
  event: FetchClientTelemetryEvent,
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info("[fetch_client]", JSON.stringify({ event, ...fields }));
}

/** `fetch` reject 가 라우트 전환·`AbortSignal` 등으로 인한 abort 계열인지 보수적으로 판별 */
export function isLikelyFetchAbortError(error: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof TypeError) {
    const m = String(error.message ?? "");
    if (m.includes("AbortError") || m.includes("aborted")) return true;
    if (m.includes("Failed to fetch") && signal?.aborted === true) return true;
  }
  return false;
}
