import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRegistrationReturnPath, REGISTRATION_DONE_DEFAULT_PATH } from "@/lib/auth/dibay-registration-steps";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";

/** 회원 가입 전체 감사 A 묶음 (2026-11-25) — docs/audit/registration-full-audit-2026-11-25.md */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("A3·A5 돌아갈 화면 단일 판정", () => {
  it.each([
    ["/\\evil.example", "/"],
    ["/\t/evil.example", "/"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
    ["/auth/onboarding/terms", "/"],
    ["/auth/onboarding/phone?next=%2Fmarket", "/"],
    ["/./login", "/"],
    ["/x/../auth/onboarding/terms", "/"],
    ["/login?next=/market", "/"],
    ["", "/"],
    [null, "/"],
  ])("%s → %s (외부·자기 자신·단계 화면·로그인 거부)", (input, expected) => {
    expect(resolveRegistrationReturnPath(input as string | null)).toBe(expected);
  });
  it("정상 화면은 그대로(검색어 포함)", () => {
    expect(resolveRegistrationReturnPath("/community-messenger/rooms/r1?m=5")).toBe("/community-messenger/rooms/r1?m=5");
    expect(resolveRegistrationReturnPath("/market")).toBe("/market");
    expect(REGISTRATION_DONE_DEFAULT_PATH).toBe("/");
  });
  it("동의 화면·예전 동의 주소·동의 폼·@id 화면이 같은 판정을 쓴다", () => {
    for (const f of [
      "app/auth/onboarding/terms/page.tsx",
      "app/auth/consent/page.tsx",
      "app/auth/onboarding/dibay-id/page.tsx",
      "components/auth/AuthConsentForm.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toContain("resolveRegistrationReturnPath");
      expect(src, f).not.toContain('startsWith("/") && !next.startsWith("//")');
      expect(src, f).not.toContain('"/philife"');
    }
  });
  it("동의 화면은 자기 자신으로 다시 보내지 않는다", () => {
    expect(read("app/auth/onboarding/terms/page.tsx")).toContain('!== "/auth/onboarding/terms") redirect(target)');
  });
  it("화면 안 이동(가입 단계 완료)에서 돌아갈 곳이 없으면 홈 — 내정보 아님", () => {
    const status = {
      profileExists: true,
      registrationNextStep: null,
      registrationComplete: true,
      isPrivilegedAdmin: false,
      dibayId: "x",
      dibayIdLocked: true,
      username: "x",
      usernameConfirmed: true,
      termsAcceptedAt: "2026-11-21",
      termsVersion: "T",
      privacyAcceptedAt: "2026-11-21",
      privacyVersion: "P",
      requiredConsent: { termsVersion: "T", privacyVersion: "P", acceptedTermsVersions: ["T"], acceptedPrivacyVersions: ["P"] },
    } as unknown as OnboardingStatus;
    expect(resolvePostLoginRoute({ hasSession: true, status, next: null, inSession: true })).toBe("/");
  });
});

describe("A1 가입 팝업 위 확인창", () => {
  it("로그아웃 확인·이 계정 지우기·약관 문서가 팝업(1310)보다 위 순서를 쓴다", () => {
    expect(read("components/auth/AuthGateOverlay.tsx")).toContain('AUTH_GATE_DIALOG_Z_CLASS = "z-[1315]"');
    // 가입 취소(로그아웃) 확인창 = 가입 전체 화면 하단 줄 한 곳 (2026-11-27 시안 v3 — 팝업이 아니라 기본 확인창 층으로 충분)
    expect(read("components/auth/RegistrationPageShell.tsx")).toContain("<LogoutActionTrigger");
    expect(read("components/auth/AuthConsentForm.tsx")).toContain("zIndexClass={AUTH_GATE_DIALOG_Z_CLASS}");
    expect(read("components/auth/RegistrationPhoneStep.tsx")).toContain("zIndexClass: AUTH_GATE_DIALOG_Z_CLASS");
    expect(read("components/ui/dibay-overlay/DibayAppDialogProvider.tsx")).toContain("zIndexClass={confirmState?.zIndexClass}");
  });
});
