import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_PROFILE_DUPLICATE_ERROR_CODE,
  ADMIN_PROFILE_DUPLICATE_FIELD,
  classifyAdminProfileDuplicate,
} from "@/lib/admin-users/admin-member-profile-write-error";
import { adminUsersAddressMessages } from "@/lib/i18n/catalog/admin-users-address";
import {
  buildPhoneVerifiedMemberPatch,
  buildPhoneVerificationStatusPatch,
  promoteLifecycleAfterAdminPhoneVerified,
} from "@/lib/profile/admin-phone-verification-sync";

/** 회원 가입 전체 감사 B 묶음 (2026-11-25) — docs/audit/registration-full-audit-2026-11-25.md */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("B1 관리자 전화 인증 승인 — 제재를 풀지 않는다", () => {
  it("인증 패치에 계정 상태(status)가 없다", () => {
    expect(buildPhoneVerifiedMemberPatch({ method: "admin_manual" })).not.toHaveProperty("status");
    expect(buildPhoneVerificationStatusPatch({ status: "verified" })).not.toHaveProperty("status");
  });
  it("승격은 제재 아닌 회원만 — DB 조건(탈퇴 제외·정지/차단 제외)으로 갱신", async () => {
    const calls: Array<[string, unknown, unknown?]> = [];
    const chain = {
      update: (v: unknown) => (calls.push(["update", v]), chain),
      eq: (c: string, v: unknown) => (calls.push(["eq", c, v]), chain),
      is: (c: string, v: unknown) => (calls.push(["is", c, v]), chain),
      or: (f: string) => (calls.push(["or", f]), chain),
      select: async () => ({ data: [], error: null }),
    };
    const sb = { from: vi.fn(() => chain) } as never;
    expect(await promoteLifecycleAfterAdminPhoneVerified(sb, "u1", "2026-11-25T00:00:00Z")).toBe(false);
    expect(calls).toContainEqual(["is", "deleted_at", null]);
    const or = calls.find((c) => c[0] === "or")?.[1] as string;
    /** 회원 OTP 경로와 같은 조건 — 제재·탈퇴 상태는 「not.in」 으로 제외 */
    expect(or).toBe("status.is.null,status.not.in.(suspended,blocked,withdrawn,deleted,deactivated)");
  });
  it("승인 API 두 곳 모두 승격 함수를 쓰고 감사 기록에 남긴다", () => {
    expect(read("app/api/admin/users/[id]/phone-verification/route.ts")).toContain("promoteLifecycleAfterAdminPhoneVerified(sb, userId)");
    expect(read("app/api/admin/users/[id]/phone-verification/route.ts")).toContain("lifecycle_promoted");
    expect(read("app/api/admin/users/[id]/route.ts")).toContain("promoteLifecycleAfterAdminPhoneVerified(sb, userId)");
  });
});

describe("B3 중복 오류 판정 — 제약 이름으로", () => {
  it.each([
    ['duplicate key value violates unique constraint "profiles_phone_unique_idx"', "phone"],
    ['duplicate key value violates unique constraint "profiles_username_lower_unique_idx"', "username"],
    ['duplicate key value violates unique constraint "profiles_nickname_lower_unique_idx"', "nickname"],
    ['duplicate key value violates unique constraint "profiles_dibay_id_lower_unique_idx"', "dibay_id"],
    ['duplicate key value violates unique constraint "profiles_dibay_id_initial_key_unique_idx"', "dibay_id"],
    ['duplicate key value violates unique constraint "profiles_other_idx"', "other"],
    ['new row for relation "profiles" violates check constraint "profiles_dibay_id_format_check"', null],
    ["network error", null],
  ])("%s → %s", (msg, kind) => {
    expect(classifyAdminProfileDuplicate(msg)).toBe(kind);
  });
  it("Postgres 코드 23505 만 있어도 「다른 중복」", () => {
    expect(classifyAdminProfileDuplicate("conflict", "23505")).toBe("other");
    expect(classifyAdminProfileDuplicate("conflict", "23514")).toBeNull();
  });
  it("코드·칸·문구 키 — 아이디 중복은 기존 키, 그 밖 중복은 일반 「중복 값」", () => {
    expect(ADMIN_PROFILE_DUPLICATE_ERROR_CODE.dibay_id).toBe("dibay_id_taken");
    expect(ADMIN_PROFILE_DUPLICATE_ERROR_CODE.other).toBe("duplicate_value");
    expect(ADMIN_PROFILE_DUPLICATE_FIELD.dibay_id).toEqual({ field: "form", errorKey: "admin_users_member_dibay_id_taken" });
    expect(ADMIN_PROFILE_DUPLICATE_FIELD.other).toEqual({ field: "form", errorKey: "admin_users_err_duplicate_value" });
    expect(adminUsersAddressMessages.ko.admin_users_err_duplicate_value).toBeTruthy();
    expect(adminUsersAddressMessages.en.admin_users_err_duplicate_value).toBeTruthy();
  });
  it("수정·생성 API — 중복은 409 + 코드, 그 밖 DB 오류는 일반 코드(원문 미노출)", () => {
    const edit = read("app/api/admin/users/[id]/route.ts");
    expect(edit).toContain("ADMIN_PROFILE_DUPLICATE_ERROR_CODE[kind] }, { status: 409 }");
    expect(edit).toContain('return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });');
    expect(edit).not.toContain("mapProfileUpdateError");
    /** 닉네임 중복 사전 확인도 코드로 (EditMemberForm 이 nickname_taken 을 번역) */
    expect(edit).toContain("error: ADMIN_PROFILE_DUPLICATE_ERROR_CODE.nickname");
    expect(edit).not.toContain("이미 사용 중인 닉네임입니다");
    const create = read("app/api/admin/users/create/route.ts");
    expect(create).toContain("jsonFieldError(mapped.field, mapped.errorKey, 409, ADMIN_PROFILE_DUPLICATE_ERROR_CODE[kind])");
    expect(create).toContain('error: "create_failed"');
    expect(create).not.toContain("error: profileError.message");
    expect(create).not.toContain("raw || await adminServerText");
    for (const form of [
      "components/admin/users/EditMemberForm.tsx",
      "components/admin/users/AdminMemberVerificationDialog.tsx",
    ]) {
      const src = read(form);
      expect(src).toContain('data.error === "duplicate_value"');
      expect(src).toContain('t("admin_users_err_duplicate_value")');
      expect(src).toContain('data.error === "dibay_id_taken"');
    }
  });
  it("Auth 로그인 주소 중복은 아이디 칸으로", () => {
    const src = read("app/api/admin/users/create/route.ts");
    expect(src).toContain('"username",\n        "admin_users_err_username_taken"');
  });
});

describe("B4 관리자 번호 변경", () => {
  it("번호 지움·OTP 회원 번호 변경 → 인증 해제, 감사에 전후 끝 4자리", () => {
    const src = read("app/api/admin/users/[id]/route.ts");
    expect(src).toContain("const resetVerification = phoneStatus === null && (!afterPhone || !manual);");
    expect(src).toContain("phone_before_last4");
    expect(src).toContain('partial: "auth_update_failed"');
  });
});

describe("B2·B5", () => {
  it("B2 라우트 필수 정보 — 전화 빠짐일 때만 관리자 확인 후 면제", () => {
    const src = read("lib/profile/require-profile-completion.server.ts");
    expect(src).toContain('missingFields.includes("phone_verified")');
    expect(src).toContain("hasActiveAdminMembershipOrLegacyRole(sb, userId)");
  });
  it("B5 세션 뼈대가 정식 프로필을 덮지 않는다(응답 뒤 다시 읽음)", () => {
    const src = read("components/auth/SupabaseAuthSync.tsx");
    expect(src).toContain("const bootNow = peekAppBootProfile() ?? bootProfile;");
  });
});
