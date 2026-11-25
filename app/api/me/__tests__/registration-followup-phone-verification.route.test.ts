/**
 * 등록 후속 감사 B8·B13 — `GET /api/me/phone-verification` 설정은 허용 목록만, 영어 요청이면 한국어 안내 문구를 비운다.
 * `send`·`verify` 는 한국어 문장 대신 코드로 답한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ language: "ko" as "ko" | "en" }));

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: async () => ({ ok: true }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({}),
}));
vi.mock("@/lib/auth/member-access", () => ({
  loadMemberAccessState: async () => ({
    phone: null,
    phoneVerified: false,
    phoneVerificationStatus: "unverified",
    nickname: "nick",
    storeMemberStatus: "sns_member",
    hasRequiredConsent: true,
  }),
  canUseVerifiedMemberFeatures: () => false,
}));
vi.mock("@/lib/auth/auth-phone-settings", () => ({
  loadAuthPhoneSettings: async () => ({
    id: "row-1",
    enabled: true,
    country_code: "PH",
    provider: "semaphore",
    sms_from_name: "DIBAY",
    otp_ttl_seconds: 300,
    resend_cooldown_seconds: 60,
    max_attempts: 5,
    guide_text: "필리핀 휴대폰 번호만 인증 가능합니다.",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    updated_by: "admin-uuid",
    change_reason: "운영 메모",
    row_version: 7,
  }),
}));
vi.mock("@/lib/auth/phone-otp-service", () => ({
  loadPendingPhoneOtpChallengeForUser: async () => null,
}));
vi.mock("@/lib/phone/available-verify-countries", () => ({
  resolveAvailableVerifyDialCodes: () => ["+63"],
}));
vi.mock("@/lib/i18n/request-app-language", () => ({
  resolveRequestAppLanguageOr: async () => state.language,
}));

import { GET } from "@/app/api/me/phone-verification/route";
import { PUBLIC_PHONE_VERIFICATION_SETTINGS_KEYS } from "@/lib/auth/phone-verification-public-settings";
import { parsePhoneVerificationSettings } from "@/lib/mypage/load-phone-verification-state";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const req = () => new Request("https://example.test/api/me/phone-verification") as never;

beforeEach(() => {
  state.language = "ko";
});

describe("B13 설정 허용 목록", () => {
  it("응답 settings 키 = 허용 목록 (관리자 변경자·사유·행 버전 없음)", async () => {
    const res = await GET(req());
    const json = (await res.json()) as { verification: Record<string, unknown> & { settings: Record<string, unknown> } };
    expect(Object.keys(json.verification.settings).sort()).toEqual([...PUBLIC_PHONE_VERIFICATION_SETTINGS_KEYS].sort());
    for (const hidden of ["id", "updated_by", "change_reason", "row_version", "sms_from_name", "max_attempts", "otp_ttl_seconds"]) {
      expect(json.verification.settings).not.toHaveProperty(hidden);
    }
    /** help_text 는 읽는 화면이 없어 내보내지 않는다 (B8) */
    expect(json.verification).not.toHaveProperty("help_text");
  });

  it("화면 파서가 읽는 키 = 허용 목록 (+ pending_challenge)", async () => {
    const res = await GET(req());
    const parsed = parsePhoneVerificationSettings(await res.json());
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!).filter((k) => k !== "pending_challenge").sort()).toEqual(
      [...PUBLIC_PHONE_VERIFICATION_SETTINGS_KEYS].sort(),
    );
    expect(parsed).toMatchObject({ enabled: true, provider: "semaphore", resend_cooldown_seconds: 60, default_dial_code: "+63" });
  });
});

describe("B8 안내 문구 언어", () => {
  it("한국어 요청 → 관리자 문구 그대로", async () => {
    const json = (await (await GET(req())).json()) as { verification: { settings: { guide_text: string } } };
    expect(json.verification.settings.guide_text).toBe("필리핀 휴대폰 번호만 인증 가능합니다.");
  });
  it("영어 요청 + 한국어 문구 → 빈 문자열(화면이 my_phone_tg_desc 로 대체)", async () => {
    state.language = "en";
    const json = (await (await GET(req())).json()) as { verification: { settings: { guide_text: string } } };
    expect(json.verification.settings.guide_text).toBe("");
    const box = readFileSync(join(process.cwd(), "components/mypage/profile/PhoneVerificationBox.tsx"), "utf8");
    expect(box).toContain('settings.guide_text || t("my_phone_tg_desc")');
  });

  it("send·verify 는 한국어 문장 대신 코드", () => {
    const send = readFileSync(join(process.cwd(), "app/api/me/phone-verification/send/route.ts"), "utf8");
    const verify = readFileSync(join(process.cwd(), "app/api/me/phone-verification/verify/route.ts"), "utf8");
    expect(send).toContain('jsonError("display_name_required", { status: 400, code: "display_name_required" })');
    expect(send).not.toContain("닉네임을 입력해 주세요");
    expect(verify).toContain('jsonError("otp_invalid", { status: 400, code: "otp_invalid" })');
    expect(verify).not.toContain("인증번호를 입력해 주세요");
  });
});
