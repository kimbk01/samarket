/**
 * 가입 후속 감사 (2026-11-25) — 결정 1(재동의 도착) · B9(앱·QR 관리자 동의 면제) · B10(약관 버전 모름) · B11(점 세그먼트)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REGISTRATION_DONE_DEFAULT_PATH,
  resolveRegistrationReturnPath,
} from "@/lib/auth/dibay-registration-steps";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { deriveNativeExchangeGateFlags } from "@/lib/auth/native/native-provider-contract";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { parseSafeInternalReturnTo } from "@/lib/addresses/mypage-addresses-return-to";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("결정 1 — 돌려보낼 곳이 없을 때 도착지", () => {
  it("기본은 앱 홈(신규 가입)", () => {
    expect(resolveRegistrationReturnPath(null)).toBe(REGISTRATION_DONE_DEFAULT_PATH);
  });
  it("재동의 회원은 로그인 착지(/mypage) — 거부된 next 도 같은 기본값", () => {
    expect(resolveRegistrationReturnPath(null, POST_LOGIN_PATH)).toBe("/mypage");
    expect(resolveRegistrationReturnPath("/login", POST_LOGIN_PATH)).toBe("/mypage");
    expect(resolveRegistrationReturnPath("https://evil.example", POST_LOGIN_PATH)).toBe("/mypage");
  });
  it("next 가 있으면 그대로", () => {
    expect(resolveRegistrationReturnPath("/philife?x=1", POST_LOGIN_PATH)).toBe("/philife?x=1");
  });
  it("동의 폼·동의 화면이 priorConsent 로 기본값을 고른다", () => {
    expect(src("components/auth/AuthConsentForm.tsx")).toContain(
      "priorConsent ? POST_LOGIN_PATH : REGISTRATION_DONE_DEFAULT_PATH",
    );
    expect(src("app/auth/onboarding/terms/page.tsx")).toContain(
      "priorConsent ? POST_LOGIN_PATH : REGISTRATION_DONE_DEFAULT_PATH",
    );
  });
});

describe("B9 — 앱·QR 로그인도 관리자 동의 면제(signupComplete) 반영", () => {
  it("동의 기록 없는 관리자(signupComplete=true) → 약관 화면 아님", () => {
    const f = deriveNativeExchangeGateFlags({
      consentComplete: false,
      dibayIdComplete: true,
      profileComplete: true,
      signupComplete: true,
    });
    expect(f.needsTermsAgreement).toBe(false);
    expect(f.needsProfileCompletion).toBe(false);
  });
  it("일반 회원 동의 미완 → 약관 화면", () => {
    const f = deriveNativeExchangeGateFlags({
      consentComplete: false,
      dibayIdComplete: true,
      profileComplete: true,
      signupComplete: false,
    });
    expect(f.needsTermsAgreement).toBe(true);
    expect(f.needsProfileCompletion).toBe(false);
  });
});

describe("B10 — 필수 약관 버전을 모르면 가입 판정·이동을 하지 않는다", () => {
  it("proxy 관문은 Strict 실패 시 보내지 않음", () => {
    const s = src("lib/auth/proxy-signup-gate.ts");
    expect(s).not.toMatch(/resolveRequiredConsentVersions\(\)/);
    expect(s.match(/resolveRequiredConsentVersionsStrict\(\)\.catch\(\(\) => null\)/g)?.length).toBe(2);
  });
  it("signup-status·mandatory-address-gate 는 503(재시도) · 단계 화면·동의 화면은 Strict", () => {
    const status = src("app/api/me/signup-status/route.ts");
    expect(status).toContain("strictConsentVersions: true");
    expect(status).toContain("consent_versions_unavailable");
    const gate = src("app/api/me/mandatory-address-gate/route.ts");
    expect(gate).toContain("strictConsentVersions: true");
    expect(gate).toContain("RequiredConsentVersionsUnavailableError");
    expect(src("lib/auth/registration-step-page.server.ts")).toContain("strictConsentVersions: true");
    const terms = src("app/auth/onboarding/terms/page.tsx");
    expect(terms).toContain("resolveRequiredConsentVersionsStrict()");
    expect(terms).not.toMatch(/resolveRequiredConsentVersions\(\)/);
    expect(terms).toContain("if (!required) return <ConsentVersionsUnavailable />;");
    expect(src("components/auth/ConsentVersionsUnavailable.tsx")).toContain("window.location.reload()");
  });
  it("다른 호출처(통화·쓰기 API)는 기본 동작 그대로 — 옵션 없이 부르면 Lenient", () => {
    const s = src("lib/auth/get-onboarding-status.ts");
    expect(s).toContain("opts?.strictConsentVersions");
    expect(s).toContain(": await resolveRequiredConsentVersions();");
    expect(src("lib/auth/require-signup-complete-api.ts")).toContain("getOnboardingStatus(sb, userId);");
  });
});

describe("B11 — 점 세그먼트·해시로 금지 경로 우회 차단", () => {
  it.each(["/./login", "/a/../login", "/%2e/login", "/login#x", "/./auth/onboarding/terms", "/api/x", "/./api/x", "/api"])(
    "sanitizeNextPath(%s) → null",
    (input) => {
      expect(sanitizeNextPath(input)).toBeNull();
    },
  );
  it.each(["/", "/philife", "/trade/123?tab=1", "/mypage/addresses", "/apis", "/a/../mypage"])(
    "sanitizeNextPath(%s) 그대로",
    (input) => {
      expect(sanitizeNextPath(input)).toBe(input);
    },
  );
  it.each(["/./login", "/login", "/signup", "/api/x", "/./api/x", "/auth/callback", "/auth/onboarding/terms/../../callback"])(
    "parseSafeInternalReturnTo(%s) → 빈 값",
    (input) => {
      expect(parseSafeInternalReturnTo(input)).toBe("");
    },
  );
  it.each([
    "/auth/onboarding/address?next=%2Fphilife",
    "/auth/onboarding/phone",
    "/mypage/addresses?purpose=delivery",
    "/stores/abc/checkout",
  ])("parseSafeInternalReturnTo(%s) 허용", (input) => {
    expect(parseSafeInternalReturnTo(input)).toBe(input);
  });
});

describe("B10 — proxy 관문 동작", () => {
  it("필수 약관 버전 Strict 실패 → 보내지 않음(null)", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.doMock("@/lib/legal/resolve-required-consent-versions", () => ({
      resolveRequiredConsentVersions: async () => ({ termsVersion: "t1", privacyVersion: "p1" }),
      resolveRequiredConsentVersionsStrict: async () => {
        throw new Error("unavailable");
      },
    }));
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "u1" }, error: null }) }) }),
    }));
    const { resolveProxySignupGateRedirect } = await import("@/lib/auth/proxy-signup-gate");
    const r = await resolveProxySignupGateRedirect({ from } as never, "u1", "/philife");
    expect(r).toBeNull();
    vi.doUnmock("@/lib/legal/resolve-required-consent-versions");
  });
});
