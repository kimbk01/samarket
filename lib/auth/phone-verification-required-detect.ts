import { STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";

/**
 * API·폼·스낵바 등 **문자열**만 있을 때 — `redirectForBlockedAction` 과 동일 기준.
 * (`requirePhoneVerified` → `jsonError(..., { code: "PHONE_VERIFICATION_REQUIRED" })` 의 `error` 본문 포함)
 */
export function isPhoneVerificationRequiredError(error: string | null | undefined): boolean {
  const msg = String(error ?? "").trim();
  if (msg === "PHONE_VERIFICATION_REQUIRED") return true;
  return (
    msg.includes(STORE_PHONE_GATE_MESSAGE) ||
    (msg.includes("전화번호") && msg.includes("인증")) ||
    (msg.includes("필리핀") && msg.includes("인증"))
  );
}

/**
 * JSON 본문에 `code` 또는 `error` 문자열이 있을 때(통화 부트스트랩 `fetch` 등).
 */
export function isPhoneVerificationRequiredApiPayload(payload: {
  error?: unknown;
  code?: unknown;
}): boolean {
  if (payload.code === "PHONE_VERIFICATION_REQUIRED") return true;
  if (typeof payload.error === "string") return isPhoneVerificationRequiredError(payload.error);
  return false;
}
