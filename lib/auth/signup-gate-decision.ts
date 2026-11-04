import type { SignupStatusApiResponse } from "@/lib/auth/fetch-signup-status-client";

/**
 * DibaySignupGate — `/api/me/signup-status` 응답 판정.
 * 확인되지 않은 상태(오류·비정상 응답)는 동의 완료로도, 동의 필요로도 확정하지 않고 재시도한다.
 * 그동안 약관 동의가 필요한 저장 API 는 서버가 403(`signup_incomplete`)으로 막는다.
 */
export type SignupGateOutcome =
  | { kind: "complete" }
  | { kind: "redirect"; target: string }
  | { kind: "session_lost" }
  | { kind: "retry" };

export function classifySignupStatusResponse(
  status: number,
  json: SignupStatusApiResponse | null | undefined,
): SignupGateOutcome {
  if (status === 401) return { kind: "session_lost" };
  if (status !== 200 || !json?.signup || typeof json.signup.consentComplete !== "boolean") {
    return { kind: "retry" };
  }
  if (json.signup.consentComplete) return { kind: "complete" };
  const target = typeof json.route === "string" ? json.route.trim() : "";
  if (!target.startsWith("/")) return { kind: "retry" };
  return { kind: "redirect", target };
}

/** 재시도 간격 — 소진 후에는 화면 이동·앱 복귀 때 다시 검사한다. */
export const SIGNUP_GATE_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const;

export function signupGateRetryDelayMs(attempt: number): number | null {
  return SIGNUP_GATE_RETRY_DELAYS_MS[attempt] ?? null;
}
