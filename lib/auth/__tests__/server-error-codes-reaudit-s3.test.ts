/**
 * 언어 재감사 2026-11-27 — 묶음 S3(내정보·로그인·계정·약관·기타 서버) 오류 문장 → 코드.
 * 서버가 문장 대신 코드를 보내도 화면 분기(로그인 시트·전화 인증·아이디 로그인·동의 화면)가 그대로 동작하는지 확인한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { mapPasswordResolveErrorCodeToMessage } from "@/lib/auth/login-error-i18n";
import { resolvePhoneOtpErrorCode, resolvePhoneOtpUiError } from "@/lib/auth/phone-otp-client-errors";
import { reauditMiscMessages } from "@/lib/i18n/catalog/reaudit-misc";
import type { MessageKey } from "@/lib/i18n/messages";
import { validateMemberNicknameInput } from "@/lib/profile/member-nickname-policy";

const openLoginRequiredSheet = vi.fn();
const openPhoneVerificationRequiredSheet = vi.fn();

vi.mock("@/lib/auth/require-auth-action", () => ({
  openLoginRequiredSheet: (...args: unknown[]) => openLoginRequiredSheet(...args),
}));

vi.mock("@/lib/auth/phone-verification-required-client", () => ({
  openPhoneVerificationRequiredSheet: (...args: unknown[]) => openPhoneVerificationRequiredSheet(...args),
}));

const t = (key: MessageKey) => key;
const HANGUL = /[가-힣]/;

describe("로그인 필요 응답 — 문장 대신 코드여도 로그인 시트", () => {
  beforeEach(() => vi.clearAllMocks());

  it("error=unauthorized → 로그인 시트", () => {
    const router = { push: vi.fn() };
    expect(redirectForBlockedAction(router, "unauthorized", "/mypage")).toBe(true);
    expect(openLoginRequiredSheet).toHaveBeenCalledWith({ actionType: "messenger_open", next: "/mypage" });
  });
});

describe("전화 인증 send-otp / verify-otp 응답 코드", () => {
  it("서버 설정 없음(503 supabase_unconfigured) — 발송·확인 실패 문구를 화면 맥락대로", () => {
    const json = { status: 503, code: "supabase_unconfigured" };
    expect(resolvePhoneOtpUiError(json, t, "send")).toBe("my_phone_send_otp_failed");
    expect(resolvePhoneOtpUiError(json, t, "verify")).toBe("my_phone_verify_code_failed");
    expect(resolvePhoneOtpErrorCode(json)).toBeNull();
  });

  it("형식 틀린 인증번호(400 otp_invalid)", () => {
    expect(resolvePhoneOtpUiError({ status: 400, code: "otp_invalid" }, t, "verify")).toBe("my_phone_err_otp_invalid");
  });
});

describe("아이디 로그인 식별자 해석 — 서버 코드 → 문구", () => {
  it.each([
    ["identifier_required", "auth_err_identifier_required"],
    ["login_identifier_lookup_unconfigured", "auth_err_login_lookup_unconfigured"],
    ["login_identifier_lookup_failed", "auth_err_login_identifier_lookup_failed"],
  ] as const)("%s → %s", (code, key) => {
    expect(mapPasswordResolveErrorCodeToMessage(code, "fallback", t)).toBe(key);
  });
});

describe("닉네임 검사 — 문장 대신 코드", () => {
  it("짧음·김", () => {
    expect(validateMemberNicknameInput("a")).toEqual({ ok: false, status: 400, message: "nickname_too_short" });
    expect(validateMemberNicknameInput("x".repeat(21))).toEqual({ ok: false, status: 400, message: "nickname_too_long" });
  });
});

describe("묶음 S3 서버 파일 — 오류 자리에 한국어 문장 0", () => {
  const files = [
    "app/api/account/phone/send-otp/route.ts",
    "app/api/account/phone/verify-otp/route.ts",
    "app/api/auth/password-login/resolve-identifier/route.ts",
    "app/api/auth/provider/conflict-check/route.ts",
    "app/api/auth/provider/link/start/route.ts",
    "app/api/auth/session/route.ts",
    "app/api/me/auth-providers/[provider]/route.ts",
    "app/api/me/block-relation/route.ts",
    "app/api/me/chats/mark-all-read/route.ts",
    "app/api/me/chats/mark-trade-read/route.ts",
    "app/api/me/consent-events/route.ts",
    "app/api/me/legal-consent/route.ts",
    "app/api/me/notification-targets/clear/route.ts",
    "app/api/me/signup-status/route.ts",
    "lib/auth/provider-identity/link-provider.server.ts",
    "lib/auth/provider-identity/password-member-lookup.server.ts",
    "lib/auth/provider-identity/provider-credential-verify.server.ts",
    "lib/auth/provider-identity/resolve-provider-login.server.ts",
    "lib/auth/provider-identity/native-session-bridge.server.ts",
    "lib/auth/resolve-password-login-identifier.ts",
    "lib/legal/record-required-consent.server.ts",
    "lib/profile/member-nickname-policy.ts",
    "lib/philife/post-body-images.ts",
  ];
  const ERROR_SLOT_HANGUL =
    /(?:\b(?:error|message)\s*:\s*|jsonError(?:WithRequest)?\((?:request,\s*)?)["`][^"`]*[가-힣]/;

  it.each(files)("%s", (rel) => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    expect(src.split("\n").filter((line) => ERROR_SLOT_HANGUL.test(line))).toEqual([]);
  });
});

describe("관리자 전화 인증 ON/OFF 실패 문구 키", () => {
  const keys = [
    "admin_phone_ops_err_security_unmet",
    "admin_phone_ops_err_rpc_unavailable",
    "admin_phone_ops_err_settings_missing",
    "admin_phone_ops_err_update_failed",
  ] as const;
  it("ko·en 모두 있고 영어에 한글 0", () => {
    for (const key of keys) {
      expect(reauditMiscMessages.ko[key]).toBeTruthy();
      expect(HANGUL.test(reauditMiscMessages.en[key])).toBe(false);
    }
  });
});
