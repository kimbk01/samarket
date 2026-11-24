import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { nextRegistrationStep } from "@/lib/auth/dibay-registration-steps";
import {
  peekRegistrationPendingKnowledge,
  resetRegistrationPendingForTests,
  setRegistrationPendingFromServer,
  subscribeRegistrationPending,
} from "@/lib/auth/registration-pending-state.client";
import { judgeMemberRegistration } from "@/lib/auth/resolve-member-registration-authority";

/** 재감사 2026-11-24 — docs/audit/registration-ssot-redesign-2026-11-24.md §14 (Owner 「설계대로 진행」) */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("A·B 심사 계정 재현 — 운영 값(2026-11-24 조회)", () => {
  const appreview01 = {
    phone: null,
    provider: "admin_manual",
    auth_provider: "admin_manual",
    role: "user",
    phone_verified: true,
    phone_verified_at: "2026-11-05T15:22:54Z",
    phone_verification_method: "admin_manual",
  };
  it("번호 없음 → 전화 단계 · 쓰기 관문도 같은 판정", () => {
    const phone = hasVerifiedPhone(appreview01);
    expect(phone).toBe(false);
    expect(nextRegistrationStep({ consentComplete: true, phoneVerified: phone, addressComplete: true })).toBe("phone");
    expect(judgeMemberRegistration({ phoneVerified: phone, hasDefaultMaster: true })).toEqual({
      kind: "REGISTRATION_REQUIRED",
      step: "phone",
    });
  });
  it("관리자가 번호를 등록하면(R1) 전화 단계 없음", () => {
    expect(hasVerifiedPhone({ ...appreview01, phone: "09171234567" })).toBe(true);
  });
});

describe("B 전화 인증 판정 입력 — 번호 필수 (R2)", () => {
  it("요청·화면 관문이 저장된 번호를 넘긴다", () => {
    const expectations: Array<[string, string]> = [
      ["lib/auth/server-guards.ts", "phone: profile.phone ?? null"],
      ["lib/auth/assert-phone-verified-for-messenger-action-client.ts", "phone: user.phone ?? null"],
      ["lib/auth/phone-otp-server-sync.ts", "phone: profile.phone ?? null"],
      ["lib/posts/phone-gate-for-post-write.ts", "phone: p.phone ?? null"],
      ["lib/profile/profile-contact-verification-ui.ts", "phone: profile.phone ?? null"],
      ["lib/profile/require-profile-completion.client.ts", "phone: profile.phone ?? null"],
      ["lib/chat/createOrGetChatRoom.ts", "phone: user.phone ?? null"],
    ];
    for (const [file, needle] of expectations) expect(read(file), file).toContain(needle);
    expect(read("lib/profile/require-profile-completion.server.ts")).toMatch(/PROFILE_FIELDS_GATE_SELECT =[\s\S]*,phone";/);
  });
  it("「모름 → 예전 판정」 분기가 없다", () => {
    const src = read("lib/auth/store-member-policy.ts");
    expect(src).not.toContain("profile.phone === undefined");
    expect(src).toContain("export type StoredPhoneFact");
  });
});

describe("D 「terms」는 「모름」 (R4)", () => {
  afterEach(() => resetRegistrationPendingForTests());
  it("terms·이상한 값 → unknown · null → complete · 단계 → 그 단계", () => {
    setRegistrationPendingFromServer("phone");
    setRegistrationPendingFromServer("terms");
    expect(peekRegistrationPendingKnowledge()).toBe("unknown");
    setRegistrationPendingFromServer(undefined);
    expect(peekRegistrationPendingKnowledge()).toBe("unknown");
    setRegistrationPendingFromServer(null);
    expect(peekRegistrationPendingKnowledge()).toBe("complete");
    setRegistrationPendingFromServer("address");
    expect(peekRegistrationPendingKnowledge()).toBe("address");
  });
  it("주소 재료 읽기는 서버 값을 그대로 넘긴다(terms 를 null 로 바꾸지 않음)", () => {
    expect(read("components/addresses/MandatoryAddressGate.tsx")).toContain(
      "setRegistrationPendingFromServer(j.registrationNextStep ?? null)",
    );
  });
  it("값이 바뀌면 구독자에게 알린다", () => {
    let n = 0;
    const off = subscribeRegistrationPending(() => {
      n += 1;
    });
    setRegistrationPendingFromServer(null);
    setRegistrationPendingFromServer("phone");
    off();
    expect(n).toBe(2);
  });
});

describe("E·C 완료 표시 무효화(R5) · 완료 순간 토큰 1회 갱신(R3)", () => {
  it("가입 관문 — 재료가 바뀌면 완료 표시를 지우고, 완료로 바뀌는 순간 기존 단일 비행 갱신 1회", () => {
    const src = read("components/auth/DibaySignupGate.tsx");
    expect(src).toContain("clearSignupCompleteResolvedSession()");
    expect(src).toContain('runBrowserAuthRefreshDeduped(sb, "registration_complete_claim")');
    expect(src).not.toContain("refreshSession(");
  });
  it("잠금 규정 개정 기록", () => {
    expect(read("docs/auth-hard-lock.md")).toContain("## Amendment 2026-11-24 — 가입 재료를 토큰 클레임에");
  });
});

describe("F proxy next 에 검색어 포함 (R6)", () => {
  it("경로 + 검색어, _rsc 제외", () => {
    const src = read("proxy.ts");
    expect(src).toContain('returnParams.delete("_rsc")');
    expect(src).toContain("returnTo: returnQs ?");
    expect(read("lib/auth/proxy-signup-gate.ts")).toContain("sanitizeNextPath(opts?.returnTo ?? pathname)");
  });
});
