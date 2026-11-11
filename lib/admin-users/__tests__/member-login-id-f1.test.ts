import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manualLoginIdFromAuthEmail } from "@/lib/admin-users/member-sns-account";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * F1 (회원 아이디 v3 후속, 2026-11-11) — 자동 아이디 발급이 username 을 덮어쓰므로
 * 어드민 「로그인 아이디」는 username 이 아니라 관리자 발급 로그인 주소(`<id>@manual.local`) 기준.
 * (로그인 자체는 resolvePasswordLoginIdentifier 가 auth_login_email 을 먼저 보므로 영향 없음.)
 */
describe("admin login id = issued manual login address (F1)", () => {
  it("login id comes from <id>@manual.local only", () => {
    expect(manualLoginIdFromAuthEmail("Kim01@manual.local")).toBe("kim01");
    expect(manualLoginIdFromAuthEmail("x@gmail.com")).toBeNull();
    expect(manualLoginIdFromAuthEmail(null)).toBeNull();
  });

  it("detail API sends manual_login_id; header·overview·auth panel never label username as login id", () => {
    expect(read("app/api/admin/users/[id]/route.ts")).toContain("manual_login_id: detailManualLoginId,");
    for (const f of ["components/admin/users/AdminMemberMasterHeader.tsx", "components/admin/users/AdminMemberOverviewPanel.tsx"]) {
      const src = read(f);
      expect(src).toContain("memberDetailLoginIdLabel(user.manual_login_id)");
      expect(src).not.toContain("memberDetailLoginIdLabel(user.username)");
    }
    expect(read("components/admin/users/AdminMemberAuthPanel.tsx")).not.toContain("memberDetailLoginIdLabel(user.username)");
  });

  it("password login still resolves the issued address before username", () => {
    const src = read("lib/auth/resolve-password-login-identifier.ts");
    expect(src.indexOf("findVerifiedIssuedManualMember(sb, issuedEmail)")).toBeLessThan(src.indexOf('.ilike("username"'));
  });
});
