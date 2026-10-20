import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminStaffRevokeMatchText,
  filterAdminStaffMemberships,
  parseAdminStaffStatusFilter,
  sortAdminStaffMemberships,
  type AdminStaffMembershipRow,
} from "@/lib/admin-users/admin-staff-membership-list";

const ROOT = process.cwd();

function row(p: Partial<AdminStaffMembershipRow>): AdminStaffMembershipRow {
  return {
    membershipId: "m",
    userId: "00000000-0000-4000-8000-000000000001",
    nickname: null,
    loginId: null,
    role: "admin",
    uiRole: "operator",
    adminTier: "operator",
    status: "active",
    permissions: [],
    grantedAt: null,
    grantedBy: null,
    grantedByNickname: null,
    revokedAt: null,
    revokedBy: null,
    revokedByNickname: null,
    revokeReason: null,
    ...p,
  };
}

describe("admin staff membership list", () => {
  const rows = [
    row({ membershipId: "a", status: "revoked", grantedAt: "2026-10-03T00:00:00Z", nickname: "old" }),
    row({ membershipId: "b", status: "active", grantedAt: "2026-10-01T00:00:00Z", nickname: "Kim", loginId: "kim01" }),
    row({ membershipId: "c", status: "active", grantedAt: "2026-10-02T00:00:00Z", nickname: "Lee" }),
    row({ membershipId: "d", status: "suspended", grantedAt: "2026-10-04T00:00:00Z" }),
  ];

  it("활성 먼저, 그다음 부여 최신순", () => {
    expect(sortAdminStaffMemberships(rows).map((r) => r.membershipId)).toEqual(["c", "b", "d", "a"]);
  });

  it("상태·검색 필터 (revoked = 활성 외 전부)", () => {
    expect(filterAdminStaffMemberships(rows, "active", "").map((r) => r.membershipId)).toEqual(["b", "c"]);
    expect(filterAdminStaffMemberships(rows, "revoked", "").map((r) => r.membershipId)).toEqual(["a", "d"]);
    expect(filterAdminStaffMemberships(rows, "all", "KIM0").map((r) => r.membershipId)).toEqual(["b"]);
    expect(parseAdminStaffStatusFilter("x")).toBe("active");
    expect(parseAdminStaffStatusFilter("all")).toBe("all");
  });

  it("해제 확인 문구 = 닉네임 → 로그인 아이디 → id 앞 8자", () => {
    expect(adminStaffRevokeMatchText(row({ nickname: " Kim " }))).toBe("Kim");
    expect(adminStaffRevokeMatchText(row({ loginId: "kim01" }))).toBe("kim01");
    expect(adminStaffRevokeMatchText(row({}))).toBe("00000000");
  });

  it("목록 API 는 super_admin 전용 읽기, 화면은 기존 쓰기 API·폼을 쓴다", () => {
    const route = readFileSync(path.join(ROOT, "app/api/admin/staff/memberships/route.ts"), "utf8");
    expect(route).toContain("requireSuperAdmin(");
    expect(route).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
    const page = readFileSync(path.join(ROOT, "components/admin/staff/AdminStaffAccountsPage.tsx"), "utf8");
    for (const s of [
      "/api/admin/staff/memberships",
      "<CreateAdminForm",
      "<PromoteMemberToAdminSheet",
      "updateAdminStaffApi(",
      'op: "revoke"',
      // R2: 권한 해제 = confirmAdminAction L3 (사유 + 대상 재입력)
      "confirmAdminAction(",
      'adminActionLevel("delete")',
      "retypeValue: adminStaffRevokeMatchText(openRow)",
      "AdminDetailDrawer",
      // R7: 서버 페이지 — 「총 N건」 + AdminPagination(20/50/100) 은 공용 목록 본문이 그린다.
      "MemberOpsListBody",
    ]) {
      expect(page, s).toContain(s);
    }
  });
});
