/**
 * 가입 후속 감사 (2026-11-25) — 관리자(스태프) 생성·수정 화면 비밀번호 오류·안내를 ko·en 키로
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminStaffFailureText } from "@/lib/admin-users/admin-staff-error-text";
import { adminUsersAddressMessages } from "@/lib/i18n/catalog/admin-users-address";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("스태프 비밀번호 오류 — 서버 문장 대신 키", () => {
  it("서버 라우트는 messageKo·DB 원문을 보내지 않고 errorKey 를 보낸다", () => {
    for (const p of ["app/api/admin/staff/route.ts", "app/api/admin/staff/[id]/route.ts"]) {
      const s = src(p);
      expect(s).not.toMatch(/message:\s*(passwordRule|weakPassword)\.messageKo/);
      expect(s).not.toMatch(/message:\s*pwdErr\.message/);
      expect(s).toContain("errorKey: passwordRule.errorKey");
      expect(s).toContain("errorKey: weakPassword.errorKey");
    }
  });
  it("호출 함수는 message·한국어 기본 문장을 쓰지 않는다", () => {
    const s = src("lib/admin-users/admin-staff-api.ts");
    expect(s).not.toMatch(/data\.message/);
    expect(s).not.toMatch(/[가-힣]+에 실패했습니다/);
  });
  it("생성·수정·승격·회원 비밀번호 화면은 한국어 상수 대신 키", () => {
    for (const p of [
      "components/admin/users/CreateAdminForm.tsx",
      "components/admin/users/EditAdminForm.tsx",
      "components/admin/users/AdminMemberPasswordDialog.tsx",
    ]) {
      const s = src(p);
      expect(s).not.toContain("adminSetPasswordHintKo");
      expect(s).not.toContain("messageKo");
    }
    expect(src("components/admin/users/EditAdminForm.tsx")).not.toContain("setError(result.error)");
  });
  it("안내 키 ko·en 둘 다", () => {
    const ko = adminUsersAddressMessages.ko as Record<string, string>;
    const en = adminUsersAddressMessages.en as Record<string, string>;
    for (const k of ["admin_users_password_hint_staff", "admin_users_password_hint_member"]) {
      expect(ko[k]).toBeTruthy();
      expect(en[k]).toBeTruthy();
      expect(en[k]).not.toMatch(/[가-힣]/);
    }
  });
});

describe("adminStaffFailureText", () => {
  const t = (k: string) => `T:${k}`;
  it("비밀번호 errorKey 면 번역", () => {
    expect(adminStaffFailureText({ error: "password_staff_rule", errorKey: "admin_users_err_password_staff_rule" }, t, true)).toBe(
      "T:admin_users_err_password_staff_rule",
    );
  });
  it("모르는 errorKey 는 번역하지 않고 코드 → 운영 문구", () => {
    const out = adminStaffFailureText({ error: "not_found", errorKey: "evil_key" }, t, false);
    expect(out.startsWith("T:")).toBe(false);
    expect(out).not.toMatch(/[가-힣]/);
  });
});
