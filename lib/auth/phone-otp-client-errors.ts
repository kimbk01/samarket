import type { MessageKey } from "@/lib/i18n/messages";
import type { PhoneOtpErrorCode } from "@/lib/auth/phone-otp-service";

export type PhoneOtpUiErrorInput = {
  status: number;
  code?: string | null;
  message?: string | null;
};

export type PhoneOtpUiErrorContext = "send" | "verify";

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const CODE_TO_KEY: Record<PhoneOtpErrorCode, MessageKey> = {
  phone_duplicate: "my_phone_err_duplicate",
  phone_invalid: "my_phone_rule_invalid",
  otp_invalid: "my_phone_err_otp_invalid",
  otp_expired: "my_phone_err_otp_expired",
  otp_required: "my_phone_err_otp_send_first",
  otp_phone_mismatch: "my_phone_err_otp_phone_mismatch",
  otp_rate_limited: "my_phone_err_otp_rate_limited",
  otp_send_failed: "my_phone_send_otp_failed",
  phone_verify_disabled: "mypage_comp_phone_verify_disabled",
  server_error: "my_phone_send_otp_failed",
};

function isPhoneOtpErrorCode(value: string | null | undefined): value is PhoneOtpErrorCode {
  if (!value) return false;
  return value in CODE_TO_KEY;
}

function legacyMessageToCode(message: string | null | undefined): PhoneOtpErrorCode | null {
  const msg = String(message ?? "").trim();
  if (!msg) return null;
  if (msg.includes("먼저 인증번호")) return "otp_required";
  if (msg.includes("만료")) return "otp_expired";
  if (msg.includes("다른 계정") || msg.includes("another account")) return "phone_duplicate";
  if (msg.includes("번호가 다릅") || msg.includes("일치하지")) return "otp_phone_mismatch";
  if (msg.includes("올바르지 않")) return "otp_invalid";
  if (msg.includes("재발송은") || msg.includes("시도 횟수")) return "otp_rate_limited";
  if (msg.includes("비활성화")) return "phone_verify_disabled";
  if (msg.includes("발송에 실패") || msg.includes("Could not send")) return "otp_send_failed";
  if (msg.includes("휴대폰 번호 형식") || msg.includes("valid Philippines")) return "phone_invalid";
  if (msg.includes("인증번호를 확인")) return "otp_invalid";
  return null;
}

export function resolvePhoneOtpUiError(
  input: PhoneOtpUiErrorInput,
  t: TranslateFn,
  context: PhoneOtpUiErrorContext = "send",
): string {
  const code =
    (isPhoneOtpErrorCode(input.code) ? input.code : null) ??
    legacyMessageToCode(input.message) ??
    (input.status === 409 ? "phone_duplicate" : null);

  if (code) {
    return t(CODE_TO_KEY[code]);
  }
  if (input.status === 400) {
    return t("my_phone_err_otp_invalid");
  }
  if (input.status === 429) {
    return t("my_phone_err_otp_rate_limited");
  }
  return t(context === "verify" ? "my_phone_verify_code_failed" : "my_phone_send_otp_failed");
}
