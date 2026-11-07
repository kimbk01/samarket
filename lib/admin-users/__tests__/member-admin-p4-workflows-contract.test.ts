import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { validateAdminCreateMemberForm } from "@/lib/admin-users/admin-create-member-fields";
import { emptyAdminCreateMemberAddress } from "@/lib/admin-users/admin-create-member-address";
import { resolveMemberPasswordResetSupported } from "@/lib/admin-users/member-password-eligibility";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("P4 member create / edit / password workflows", () => {
  it("create form uses MemberAdminDialog and requires password confirm", () => {
    const form = src("components/admin/users/CreateMemberForm.tsx");
    expect(form).toMatch(/MemberAdminDialog/);
    expect(form).toMatch(/passwordConfirm/);
    expect(form).toMatch(/createdUserId/);
    expect(form).toMatch(/data\.user\?\.id/);
    expect(form).not.toMatch(/DibayOverlayRoot/);
    expect(form).not.toMatch(/admin_users_label_auth_email/);
    const errors = validateAdminCreateMemberForm(
      {
        username: "qa_p4_user",
        password: "123456",
        passwordConfirm: "999999",
        nickname: "큐에이",
        name: "테스터",
        email: "",
        contactPhoneDigits: "",
        accountType: "development_member",
        address: emptyAdminCreateMemberAddress(),
      },
      { addressAttempted: false, phoneRuleKey: "phone_rule" },
    );
    expect(errors.passwordConfirm).toBe("admin_users_err_password_mismatch");
  });

  it("create API compensates Auth on profile failure and audits without password", () => {
    const route = src("app/api/admin/users/create/route.ts");
    expect(route).toMatch(/auth\.admin\.createUser/);
    expect(route).toMatch(/auth\.admin\.deleteUser/);
    expect(route).toMatch(/admin_member_create/);
    expect(route).toMatch(/appendAuditLog/);
    const auditBlock = route.slice(route.indexOf("admin_member_create"));
    expect(auditBlock).not.toMatch(/password,/);
  });

  it("edit form uses MemberAdminDialog and does not mutate password", () => {
    const form = src("components/admin/users/EditMemberForm.tsx");
    expect(form).toMatch(/MemberAdminDialog/);
    expect(form).toMatch(/member_edit_title|정보 수정/);
    expect(form).not.toMatch(/body\.password/);
    expect(form).not.toMatch(/DibayOverlayRoot/);
    const patch = src("app/api/admin/users/[id]/route.ts");
    expect(patch).toMatch(/admin_member_profile_update/);
  });

  it("password dialog uses P1 Dialog and auth PATCH only", () => {
    const dialog = src("components/admin/users/AdminMemberPasswordDialog.tsx");
    expect(dialog).toMatch(/MemberAdminDialog/);
    expect(dialog).toMatch(/password_temp_set_title/);
    expect(MEMBER_ADMIN_COPY.password_temp_set_title).toBe("새 임시 비밀번호 설정");
    expect(dialog).toMatch(/\/auth/);
    expect(dialog).toMatch(/method:\s*"PATCH"/);
    expect(dialog).not.toMatch(/현재 비밀번호 보기/);
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toMatch(/AdminMemberPasswordDialog/);
    expect(header).toMatch(/passwordResetSupported/);
  });

  it("password eligibility = 관리자 생성 회원만 (Owner 2026-11-08 「수동 회원만」)", () => {
    // 관리자 생성: admin_manual 표시 또는 @manual.local 로그인 주소
    expect(
      resolveMemberPasswordResetSupported({ authUserPresent: true, profileAuthProvider: "admin_manual" }),
    ).toBe(true);
    expect(
      resolveMemberPasswordResetSupported({
        authUserPresent: true,
        identityProviders: ["email"],
        authEmail: "appreview01@manual.local",
      }),
    ).toBe(true);
    // 네이티브 SNS 회원 — Supabase 내부 로그인 방식은 email 이지만 대상 아님
    expect(
      resolveMemberPasswordResetSupported({
        authUserPresent: true,
        identityProviders: ["email"],
        authEmail: "apple.001125.x@apple.native.dibay.internal",
        profileProvider: "apple",
        linkedSnsProviders: ["apple"],
      }),
    ).toBe(false);
    expect(
      resolveMemberPasswordResetSupported({
        authUserPresent: true,
        identityProviders: ["email"],
        authEmail: "google.1@google.native.dibay.internal",
        profileProvider: "email",
        linkedSnsProviders: ["google"],
      }),
    ).toBe(false);
    // SNS 가 연결되면 admin_manual 표시가 있어도 대상 아님
    expect(
      resolveMemberPasswordResetSupported({
        authUserPresent: true,
        profileAuthProvider: "admin_manual",
        linkedSnsProviders: ["kakao"],
      }),
    ).toBe(false);
    // 일반 이메일 가입 — 대상 아님
    expect(
      resolveMemberPasswordResetSupported({ authUserPresent: true, identityProviders: ["email"], authEmail: "a@gmail.com" }),
    ).toBe(false);
    expect(resolveMemberPasswordResetSupported({ authUserPresent: false, profileAuthProvider: "admin_manual" })).toBe(false);
    const authRoute = src("app/api/admin/users/[id]/auth/route.ts");
    expect(authRoute).toMatch(/passwordResetSupported/);
    expect(authRoute).toMatch(/PASSWORD_TEMP_SET/);
    expect(authRoute).toMatch(/password_reset_unsupported/);
  });

  it("auth panel does not offer inline password mutation", () => {
    const auth = src("components/admin/users/AdminMemberAuthPanel.tsx");
    expect(auth).not.toMatch(/submitPassword/);
    expect(auth).toMatch(/비밀번호 관리/);
  });
});
