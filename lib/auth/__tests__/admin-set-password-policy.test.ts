import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEMBER_PASSWORD_MIN_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
  checkAdminSetPassword,
  mapSupabaseWeakPasswordError,
} from "@/lib/auth/admin-set-password-policy";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("admin-set-password-policy (설계안 ⑨)", () => {
  it("회원: 숫자만 6자 이상 허용, 6자 미만 거절", () => {
    expect(MEMBER_PASSWORD_MIN_LENGTH).toBe(6);
    expect(checkAdminSetPassword("123456", "member").ok).toBe(true);
    expect(checkAdminSetPassword("000000", "member").ok).toBe(true);
    expect(checkAdminSetPassword("abc123", "member").ok).toBe(true);
    const short = checkAdminSetPassword("1234", "member");
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toBe("password_min");
    expect(checkAdminSetPassword("", "member").ok).toBe(false);
    expect(checkAdminSetPassword("1".repeat(129), "member").ok).toBe(false);
  });

  it("관리자: 8자 이상 + 영문·숫자 모두 필요", () => {
    expect(STAFF_PASSWORD_MIN_LENGTH).toBe(8);
    expect(checkAdminSetPassword("12345678", "staff").ok).toBe(false);
    expect(checkAdminSetPassword("abcdefgh", "staff").ok).toBe(false);
    expect(checkAdminSetPassword("abc1234", "staff").ok).toBe(false);
    expect(checkAdminSetPassword("abcd1234", "staff").ok).toBe(true);
  });

  it("Supabase weak_password(유출 목록) → 한국어 사유", () => {
    const pwned = mapSupabaseWeakPasswordError({
      code: "weak_password",
      status: 422,
      message: "Password is known to be weak and easy to guess, please choose a different one.",
      reasons: ["pwned"],
    });
    expect(pwned?.error).toBe("password_weak");
    expect(pwned?.reasons).toEqual(["pwned"]);
    expect(pwned?.messageKo).toMatch(/유출/);

    // reasons 없이 운영 로그 원문만 있을 때 (2026-11-05 PHT 실제 거절 문구)
    const fromMessage = mapSupabaseWeakPasswordError({
      status: 422,
      message: "Password is known to be weak and easy to guess, please choose a different one.",
    });
    expect(fromMessage?.reasons).toEqual(["pwned"]);

    const length = mapSupabaseWeakPasswordError({ code: "weak_password", message: "Password should be at least 8 characters.", reasons: ["length"] });
    expect(length?.messageKo).toMatch(/길이/);

    expect(mapSupabaseWeakPasswordError({ status: 500, message: "Database error" })).toBeNull();
    expect(mapSupabaseWeakPasswordError(null)).toBeNull();
  });

  it("어드민 비밀번호 설정 경로가 모두 같은 규칙 모듈을 쓴다 (4자 하드코딩 금지)", () => {
    const files: Array<[string, string]> = [
      ["app/api/admin/users/[id]/auth/route.ts", "member"],
      ["app/api/admin/users/[id]/route.ts", "member"],
      ["app/api/admin/users/create/route.ts", "member"],
      ["lib/admin-users/admin-create-member-fields.ts", "member"],
      ["components/admin/users/AdminMemberPasswordDialog.tsx", "member"],
      ["app/api/admin/staff/route.ts", "staff"],
      ["app/api/admin/staff/[id]/route.ts", "staff"],
      ["components/admin/users/CreateAdminForm.tsx", "staff"],
      ["components/admin/users/EditAdminForm.tsx", "staff"],
    ];
    for (const [file, target] of files) {
      const body = src(file);
      expect(body, file).toMatch(new RegExp(`checkAdminSetPassword\\([^)]*"${target}"\\)`));
      expect(body, file).not.toMatch(/password\.length < 4|pwd\.length < 4|newPassword\.length < 4|minLength=\{4\}/);
    }
  });

  it("Supabase 거절은 서버가 한국어 사유로 바꿔 돌려준다", () => {
    for (const file of [
      "app/api/admin/users/[id]/auth/route.ts",
      "app/api/admin/users/[id]/route.ts",
      "app/api/admin/users/create/route.ts",
      "app/api/admin/staff/route.ts",
      "app/api/admin/staff/[id]/route.ts",
    ]) {
      expect(src(file), file).toMatch(/mapSupabaseWeakPasswordError/);
    }
    expect(src("components/admin/users/CreateMemberForm.tsx")).not.toMatch(/minLength=\{4\}/);
    expect(src("app/api/admin/users/[id]/auth/route.ts")).toMatch(/PASSWORD_TEMP_SET_REJECTED/);
  });
});
