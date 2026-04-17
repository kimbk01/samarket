/**
 * 프로필링/누수 점검용 런타임 로그 — 기본 꺼짐.
 *
 * 켜기: `sessionStorage.setItem("samarket:debug:runtime", "1")` 후 새로고침.
 * 끄기: `sessionStorage.removeItem("samarket:debug:runtime")`.
 */

export function samarketRuntimeDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem("samarket:debug:runtime") === "1";
  } catch {
    return false;
  }
}

export function samarketRuntimeDebugLog(tag: string, message: string, extra?: Record<string, unknown>): void {
  if (!samarketRuntimeDebugEnabled()) return;
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(`[samarket-debug:${tag}] ${message}`, extra ?? "");
  }
}
