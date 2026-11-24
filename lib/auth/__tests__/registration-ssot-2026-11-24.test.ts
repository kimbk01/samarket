import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { deriveStoreMemberStatus } from "@/lib/auth/store-member-policy";
import { canUseVerifiedMemberFeatures, type MemberAccessState } from "@/lib/auth/member-access";
import { resolveDefaultVerifyDialCode } from "@/lib/phone/phone-country-codes";
import { parseDibayMemberClaim } from "@/lib/auth/member-token-claims";
import { validateAdminCreateMemberForm } from "@/lib/admin-users/admin-create-member-fields";
import { emptyAdminCreateMemberAddress } from "@/lib/admin-users/admin-create-member-address";
import { registrationStepNext } from "@/lib/auth/registration-step-page.server";

/** 가입 SSOT 재설계 — docs/audit/registration-ssot-redesign-2026-11-24.md (Owner 「설계대로 진행」) */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("C-1·C-2 건너뛰기·세션당 1회 제거", () => {
  it("가입 단계 화면에 [나중에 하기]가 없다", () => {
    for (const f of ["components/auth/RegistrationPhoneStep.tsx", "components/auth/RegistrationAddressStep.tsx"]) {
      const src = read(f);
      expect(src).not.toContain("RegistrationStepLaterButton");
      expect(src).not.toContain("onLater");
      expect(src).not.toContain("deferProfileSetupForSession");
    }
  });
  it("주소 재료 읽기(MandatoryAddressGate)는 화면을 옮기지 않는다 — 이동 주인은 DibaySignupGate 1곳", () => {
    const src = read("components/addresses/MandatoryAddressGate.tsx");
    expect(src).not.toContain("router.replace");
    expect(src).not.toContain("useRouter");
    expect(read("components/auth/DibaySignupGate.tsx")).toContain("resolveRegistrationGateTarget");
  });
});

describe("C-3·C-4 동의 뒤 다음 화면은 항상 서버 판정, 실패하면 단계 화면", () => {
  it("재동의도 signup-status 를 묻고, 기본 목적지는 단계 화면", () => {
    const src = read("components/auth/AuthConsentForm.tsx");
    expect(src).toContain('registrationStepHref("phone", next)');
    expect(src).not.toContain("if (!priorConsent) {");
  });
});

describe("C-6 단계 화면 next 기본값 = 홈", () => {
  it("next 가 없거나 auth 경로면 / (내정보 아님)", () => {
    expect(registrationStepNext(undefined)).toBe("/");
    expect(registrationStepNext("/auth/onboarding/terms")).toBe("/");
    expect(registrationStepNext("/community-messenger/rooms/r1")).toBe("/community-messenger/rooms/r1");
  });
});

describe("C-7 국가번호 기본값 — 접속 나라", () => {
  const both = ["+63", "+82"];
  it.each([
    ["PH", both, "+63"],
    ["KR", both, "+82"],
    ["US", both, "+82"],
    [null, both, "+63"],
    ["", both, "+63"],
    ["KR", ["+63"], "+63"],
  ] as const)("%s → %s", (country, codes, expected) => {
    expect(resolveDefaultVerifyDialCode(country, codes)).toBe(expected);
  });
});

describe("C-8 수동 회원 — 번호 있을 때만 전화 인증", () => {
  const manual = { provider: "admin_manual", phone_verified: true, phone_verified_at: "2026-10-01T00:00:00Z" };
  it("번호 없음이 확실하면 미인증", () => {
    expect(hasVerifiedPhone({ ...manual, phone: null })).toBe(false);
    expect(hasVerifiedPhone({ ...manual, phone: "  " })).toBe(false);
    expect(hasVerifiedPhone({ ...manual, has_phone: false })).toBe(false);
  });
  it("번호 있음 → 인증 (번호는 필수 입력 — 재감사 R2: 「모름」 분기 없음)", () => {
    expect(hasVerifiedPhone({ ...manual, phone: "09171234567" })).toBe(true);
    expect(hasVerifiedPhone({ ...manual, has_phone: true })).toBe(true);
    expect(hasVerifiedPhone({ provider: "admin_manual", phone_verified: false, phone: "09171234567" })).toBe(true);
  });
  it("수동 회원이 아니면 번호 규칙을 적용하지 않는다", () => {
    expect(hasVerifiedPhone({ provider: "google", phone_verified: true, phone: null })).toBe(true);
  });
  it("관리자(특권)는 면제", () => {
    expect(hasVerifiedPhone({ provider: "admin_manual", privilegedAdmin: true, phone: null })).toBe(true);
  });
  it("생성 폼 — 전화·대표 주소 필수", () => {
    const errors = validateAdminCreateMemberForm(
      {
        username: "user01",
        password: "Abcd1234!x",
        passwordConfirm: "Abcd1234!x",
        nickname: "nick",
        name: "name",
        email: "",
        contactPhoneDigits: "",
        accountType: "operations_member",
        address: emptyAdminCreateMemberAddress(),
      },
      { addressAttempted: false, phoneRuleKey: "admin_users_member_verify_invalid_phone" },
    );
    expect(errors.contactPhone).toBe("admin_users_err_phone_required");
    expect(errors.addressSearch).toBe("addr_ui_pick_search_result");
  });
  it("생성 API — 동의를 대신 기록하지 않고, 주소 실패면 생성 취소", () => {
    const src = read("app/api/admin/users/create/route.ts");
    expect(src).not.toMatch(/terms_accepted_at:\s*nowIso/);
    expect(src).not.toMatch(/privacy_accepted_at:\s*nowIso/);
    expect(src).toContain('"admin_users_err_phone_required"');
    expect(src).toContain('"admin_users_err_address_seed_failed"');
    expect(src).not.toContain("address_warning");
  });
});

describe("C-9 인증 저장값(status·member_status)은 판정·표시에 쓰지 않는다", () => {
  it("member_status=pending 이어도 전화 인증이면 인증 회원 표시", () => {
    expect(deriveStoreMemberStatus({ member_status: "pending", phone_verified: true, provider: "google", phone: null })).toBe(
      "verified_member",
    );
    expect(deriveStoreMemberStatus({ member_status: "active", phone_verified: false, provider: "google", phone: null })).toBe(
      "sns_member",
    );
    expect(
      deriveStoreMemberStatus({ member_status: "pending", phone_verified: false, provider: "admin_manual", phone: "09171234567" }),
    ).toBe("admin_manual");
  });
  it("인증 회원 기능 = hasVerifiedPhone 하나 (운영 member_status=pending 수동 회원이 보내기에서 막히던 결함)", () => {
    const base: MemberAccessState = {
      userId: "u1",
      role: "user",
      email: null,
      nickname: "n",
      memberType: "normal",
      status: "verified_user",
      phone: "09171234567",
      phoneVerified: true,
      phoneVerificationStatus: "verified",
      authProvider: "admin_manual",
      memberStatus: "pending",
    } as MemberAccessState;
    expect(canUseVerifiedMemberFeatures(base)).toBe(true);
    expect(canUseVerifiedMemberFeatures({ ...base, phone: null })).toBe(false);
    expect(canUseVerifiedMemberFeatures({ ...base, authProvider: "google", phoneVerified: false, phone: null })).toBe(false);
  });
});

describe("S2 토큰 클레임 가입 재료", () => {
  const baseClaim = {
    v: 1,
    status: "verified_user",
    deleted_at: null,
    terms_accepted_at: "2026-11-01",
    terms_version: "t1",
    privacy_accepted_at: "2026-11-01",
    privacy_version: "p1",
  };
  it("훅 적용 전 토큰(reg 없음) → registration null (proxy 는 가입 단계 판정 안 함)", () => {
    expect(parseDibayMemberClaim(baseClaim)?.registration).toBeNull();
  });
  it("reg=1 → 재료 파싱 (번호는 있음/없음만)", () => {
    const c = parseDibayMemberClaim({
      ...baseClaim,
      reg: 1,
      phone_verified: true,
      provider: "kakao",
      has_phone: true,
      has_default_master: false,
    });
    expect(c?.registration).toMatchObject({ phone_verified: true, has_phone: true, has_default_master: false });
  });
  it("훅 SQL 은 번호 자체를 토큰에 넣지 않는다", () => {
    const sql = read("supabase/migrations/20271124120000_registration_ssot_phone_fact_and_claims.sql");
    expect(sql).toContain("'has_phone'");
    expect(sql).not.toMatch(/'phone',\s*v_row\.phone/);
  });
});
