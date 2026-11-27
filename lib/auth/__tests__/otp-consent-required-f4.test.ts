/**
 * F4 (2026-11-27) — 전화 OTP 는 동의 뒤 (C4 B6 · SG-06). 설계 `docs/audit/f4-otp-address-consent-design-2026-11-27.md`.
 * - 4개 OTP 라우트: 미동의면 403 `signup_incomplete`(step 없음), 발송 한도·SMS·인증 함수를 부르지 않는다.
 * - 동의·특권 관리자는 기존대로 진행. 판정 불가는 503.
 * - 정적: OTP 서비스 함수를 부르는 라우트는 모두 `requireMemberConsent` 를 부른다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import type { MemberConsentAuthorityResult } from "@/lib/auth/resolve-member-consent-authority";

const s = vi.hoisted(() => ({
  consent: { kind: "CONSENT_REQUIRED", gap: "terms_privacy" } as unknown,
  sendCalls: 0,
  verifyCalls: 0,
  quotaCalls: 0,
}));

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: async () => ({ ok: true }),
}));
vi.mock("@/lib/auth/resolve-member-consent-authority", () => ({
  resolveMemberConsentAuthority: async () => s.consent,
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({}),
}));
vi.mock("@/lib/security/rate-limit-presets", () => ({
  enforcePhoneVerificationSendQuota: async () => {
    s.quotaCalls += 1;
    return { ok: true };
  },
  enforcePhoneVerificationCheckQuota: async () => {
    s.quotaCalls += 1;
    return { ok: true };
  },
}));
vi.mock("@/lib/auth/member-access", () => ({
  loadMemberAccessState: async () => ({ phoneVerified: false }),
  canUseVerifiedMemberFeatures: () => false,
}));
vi.mock("@/lib/auth/phone-otp-server-sync", () => ({
  precheckProfileDisplayName: async () => ({ ok: true }),
  patchProfileDisplayName: async () => ({ ok: true }),
  syncPhoneVerifiedServerCache: async () => {},
}));
vi.mock("@/lib/auth/phone-otp-service", () => ({
  sendPhoneOtpForUser: async () => {
    s.sendCalls += 1;
    return { ok: true, data: { phone: "+639171234567" } };
  },
  verifyPhoneOtpForUser: async () => {
    s.verifyCalls += 1;
    return { ok: true, data: { phone: "+639171234567" } };
  },
}));

import { POST as accountSend } from "@/app/api/account/phone/send-otp/route";
import { POST as accountVerify } from "@/app/api/account/phone/verify-otp/route";
import { POST as meSend } from "@/app/api/me/phone-verification/send/route";
import { POST as meVerify } from "@/app/api/me/phone-verification/verify/route";

const ROUTES = [
  ["account/send-otp", accountSend, { phone: "09171234567" }],
  ["account/verify-otp", accountVerify, { phone: "09171234567", otp: "123456" }],
  ["me/send", meSend, { phone: "09171234567", display_name: "nick" }],
  ["me/verify", meVerify, { phone: "09171234567", code: "123456", display_name: "nick" }],
] as const;

function req(body: object): NextRequest {
  return new NextRequest("https://x.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  s.sendCalls = 0;
  s.verifyCalls = 0;
  s.quotaCalls = 0;
});

describe("F4 — OTP 라우트 동의 확인", () => {
  it("미동의: 403 signup_incomplete(step 없음) · 한도·SMS·인증 미호출", async () => {
    s.consent = { kind: "CONSENT_REQUIRED", gap: "terms_privacy" } satisfies Partial<MemberConsentAuthorityResult>;
    for (const [name, POST, body] of ROUTES) {
      const res = await POST(req(body));
      expect(res.status, name).toBe(403);
      const json = (await res.json()) as { code?: string; step?: string; message?: string };
      expect(json.code, name).toBe("signup_incomplete");
      expect(json.step, name).toBeUndefined();
      // 서버 한국어 문장 없음 (i18n SSOT)
      expect(json.message, name).toBe("signup_incomplete");
    }
    expect(s.quotaCalls).toBe(0);
    expect(s.sendCalls).toBe(0);
    expect(s.verifyCalls).toBe(0);
  });

  it("판정 불가: 503 consent_state_unavailable (fail-closed)", async () => {
    s.consent = { kind: "UNAVAILABLE", reason: "query_error" };
    for (const [name, POST, body] of ROUTES) {
      const res = await POST(req(body));
      expect(res.status, name).toBe(503);
      expect(((await res.json()) as { code?: string }).code, name).toBe("consent_state_unavailable");
    }
    expect(s.sendCalls + s.verifyCalls + s.quotaCalls).toBe(0);
  });

  it("동의·특권 관리자: 기존대로 발송·인증까지 간다", async () => {
    for (const consent of [
      { kind: "CONSENTED", via: "consent" },
      { kind: "CONSENTED", via: "privileged_admin" },
    ] as const) {
      s.consent = consent;
      for (const [name, POST, body] of ROUTES) {
        const res = await POST(req(body));
        expect(res.status, `${consent.via} ${name}`).not.toBe(403);
      }
    }
    expect(s.sendCalls).toBe(4);
    expect(s.verifyCalls).toBe(4);
  });

  it("정적: OTP 서비스 함수를 부르는 라우트는 모두 동의 확인을 먼저 부른다", () => {
    const files = execSync(
      "git grep -l -E 'sendPhoneOtpForUser|verifyPhoneOtpForUser' -- 'app/api/**/route.ts'",
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const consentAt = src.indexOf("await requireMemberConsent(auth.userId)");
      expect(consentAt, f).toBeGreaterThan(0);
      for (const later of ["enforcePhoneVerification", "sendPhoneOtpForUser(", "verifyPhoneOtpForUser("]) {
        const at = src.indexOf(later, src.indexOf("export async function POST"));
        if (at >= 0) expect(consentAt, `${f} ${later}`).toBeLessThan(at);
      }
    }
  });
});
