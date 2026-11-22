/**
 * 요청 실패 하나를 그 실패의 값으로 분류 — 설계 `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-3.
 * 순수 함수(시험 대상). 「요즘 상태」가 아니라 그 오류·응답만 본다.
 *
 * - aborted: 호출 쪽 취소(화면 이동 등) — 안내하지 않는다
 * - timeout: `AbortSignal.timeout` 등 시간 초과
 * - network: 응답을 못 받음(TypeError "Failed to fetch"·"Load failed"·"NetworkError") — 기기인지 DIBAY 인지는 확인 요청으로 가른다
 * - server: DIBAY 가 5xx 로 응답했거나 응답 본문이 깨짐(JSON 해석 실패) — 기기는 서버까지 닿았다
 * - client: 4xx — 네트워크 문제가 아니다(각 화면의 기존 문구)
 * - unknown: 그 밖의 예외
 */
import { isLikelyFetchAbortError } from "@/lib/http/fetch-client-telemetry";

export type RequestFailureKind = "aborted" | "timeout" | "network" | "server" | "client" | "unknown";

function isResponseLike(v: unknown): v is { status: number } {
  return typeof v === "object" && v !== null && typeof (v as { status?: unknown }).status === "number";
}

export function classifyRequestFailure(failure: unknown, signal?: AbortSignal | null): RequestFailureKind {
  if (isResponseLike(failure)) {
    if (failure.status >= 500) return "server";
    if (failure.status >= 400) return "client";
    return "unknown";
  }
  if (typeof DOMException !== "undefined" && failure instanceof DOMException && failure.name === "TimeoutError") {
    return "timeout";
  }
  if (isLikelyFetchAbortError(failure, signal)) return "aborted";
  if (failure instanceof TypeError) return "network";
  if (failure instanceof SyntaxError) return "server";
  return "unknown";
}
