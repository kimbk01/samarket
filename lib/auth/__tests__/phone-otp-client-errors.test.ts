import { describe, expect, it } from "vitest";
import { resolvePhoneOtpUiError } from "@/lib/auth/phone-otp-client-errors";
import type { MessageKey } from "@/lib/i18n/messages";

const t = (key: MessageKey) => key;

describe("phone-otp-client-errors", () => {
  it("maps phone_duplicate code to i18n key", () => {
    expect(
      resolvePhoneOtpUiError({ status: 409, code: "phone_duplicate", message: "legacy" }, t),
    ).toBe("my_phone_err_duplicate_short");
  });

  it("maps legacy duplicate message when code missing", () => {
    expect(
      resolvePhoneOtpUiError(
        { status: 409, message: "이미 다른 계정에서 사용 중인 전화번호입니다." },
        t,
      ),
    ).toBe("my_phone_err_duplicate_short");
  });

  it("maps otp_invalid code", () => {
    expect(
      resolvePhoneOtpUiError({ status: 400, code: "otp_invalid", message: "" }, t),
    ).toBe("my_phone_err_otp_invalid");
  });

  it("provider rejection says the number is fine (Owner 2026-11-09)", () => {
    expect(
      resolvePhoneOtpUiError({ status: 502, code: "otp_send_failed", message: "인증번호 발송에 실패했습니다." }, t),
    ).toBe("my_phone_send_otp_failed_provider");
  });

  it("falls back for unknown server errors", () => {
    expect(resolvePhoneOtpUiError({ status: 500, message: "db down" }, t)).toBe(
      "my_phone_send_otp_failed",
    );
    expect(resolvePhoneOtpUiError({ status: 500, message: "db down" }, t, "verify")).toBe(
      "my_phone_verify_code_failed",
    );
  });

  it("maps otp_required before generic confirm message", () => {
    expect(
      resolvePhoneOtpUiError(
        { status: 400, message: "먼저 인증번호를 요청해 주세요." },
        t,
      ),
    ).toBe("my_phone_err_otp_send_first");
  });
});
