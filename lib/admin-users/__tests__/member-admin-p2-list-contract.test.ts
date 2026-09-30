import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminMemberSearchFilterOps,
  adminMemberStatusFilterOps,
} from "@/lib/admin-users/admin-member-list-query";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { resolveMemberAdminActionPolicy } from "@/lib/admin-users/member-admin-action-policy";
import {
  MEMBER_LIST_SEARCH_PLACEHOLDER_KO,
  MEMBER_LIST_STORE_NONE_KO,
  buildMemberListQueryString,
  memberListAccountStateLabelKo,
  memberListDetailHref,
  memberListPrivilegeLabelKo,
  memberListSignupOriginLabelKo,
  memberListStoreCellLabel,
  memberListStoreDetailHref,
  parseMemberListQueryState,
} from "@/lib/admin-users/member-list-presentation";
import { statusCategoryForAdminUser } from "@/components/admin/users/admin-user-lite-display";
import type { AdminUser } from "@/lib/types/admin-user";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseUser(over: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nickname: "tester",
    memberType: "normal",
    moderationStatus: "normal",
    productCount: 0,
    soldCount: 0,
    reviewCount: 0,
    reportCount: 0,
    chatCount: 0,
    joinedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("P2 member list — state labels", () => {
  it("maps ACTIVE/SUSPENDED/BLOCKED/WITHDRAWN to operator Korean", () => {
    expect(memberListAccountStateLabelKo(baseUser({ statusCategory: "active" }))).toBe(
      MEMBER_ADMIN_COPY.status_active,
    );
    expect(memberListAccountStateLabelKo(baseUser({ statusCategory: "suspended" }))).toBe(
      MEMBER_ADMIN_COPY.status_suspended,
    );
    expect(memberListAccountStateLabelKo(baseUser({ statusCategory: "blocked" }))).toBe(
      MEMBER_ADMIN_COPY.status_blocked,
    );
    expect(memberListAccountStateLabelKo(baseUser({ statusCategory: "deleted" }))).toBe(
      MEMBER_ADMIN_COPY.status_withdrawn,
    );
  });

  it("blocked display is never suspended", () => {
    const blocked = baseUser({ moderationStatus: "blocked" });
    expect(statusCategoryForAdminUser(blocked)).toBe("blocked");
    expect(memberListAccountStateLabelKo(blocked)).toBe(MEMBER_ADMIN_COPY.status_blocked);
    expect(memberListAccountStateLabelKo(blocked)).not.toBe(MEMBER_ADMIN_COPY.status_suspended);
  });
});

describe("P2 member list — status filter ops", () => {
  it("suspended filter does not include blocked", () => {
    const raw = JSON.stringify(adminMemberStatusFilterOps("suspended"));
    expect(raw).toContain("status.eq.suspended");
    expect(raw).not.toContain("status.eq.blocked");
  });

  it("blocked filter includes blocked and excludes deleted", () => {
    const raw = JSON.stringify(adminMemberStatusFilterOps("blocked"));
    expect(raw).toContain("status.eq.blocked");
    expect(raw).not.toContain("status.eq.suspended");
  });
});

describe("P2 member list — store relation", () => {
  it("renders none vs name + store id and canonical business href", () => {
    expect(memberListStoreCellLabel(baseUser()).kind).toBe("none");
    expect(MEMBER_LIST_STORE_NONE_KO).toBe("매장 없음");
    const withStore = baseUser({
      storeRelation: {
        count: 1,
        hasApproved: true,
        stores: [{ id: "store-abc", name: "한식당", approvalStatus: "approved", isVisible: true, connectedAt: null }],
      },
    });
    const cell = memberListStoreCellLabel(withStore);
    expect(cell.kind).toBe("store");
    expect(cell.name).toBe("한식당");
    expect(cell.storeId).toBe("store-abc");
    expect(cell.href).toBe("/admin/business/store-abc");
    expect(memberListStoreDetailHref("store-abc")).toBe("/admin/business/store-abc");
  });
});

describe("P2 member list — privilege and origin", () => {
  it("separates admin privilege from store", () => {
    expect(memberListPrivilegeLabelKo(baseUser())).toBe(MEMBER_ADMIN_COPY.privilege_member);
    expect(memberListPrivilegeLabelKo(baseUser({ hasAdminMembership: true }))).toBe(
      MEMBER_ADMIN_COPY.privilege_admin,
    );
    expect(memberListPrivilegeLabelKo(baseUser({ isSuperAdmin: true, hasAdminMembership: true }))).toBe(
      MEMBER_ADMIN_COPY.privilege_super_admin,
    );
  });

  it("maps signup origin without ADMIN_MANUAL raw", () => {
    expect(memberListSignupOriginLabelKo("manual")).toBe(MEMBER_ADMIN_COPY.origin_admin_manual);
    expect(memberListSignupOriginLabelKo("manual")).not.toContain("ADMIN_MANUAL");
    expect(memberListSignupOriginLabelKo("kakao")).toBe(MEMBER_ADMIN_COPY.origin_kakao);
  });
});

describe("P2 member list — search and query", () => {
  it("UUID search can union store-owner extras", () => {
    const ops = adminMemberSearchFilterOps("11111111-1111-4111-8111-111111111111", {
      extraIds: ["22222222-2222-4222-8222-222222222222"],
    });
    expect(JSON.stringify(ops)).toContain("id.in.");
  });

  it("query string is the list authority", () => {
    const qs = buildMemberListQueryString({
      search: "cafe",
      status: "blocked",
      verify: "verified",
      store: "has_store",
      privilege: "admin",
      origin: "kakao",
      page: 2,
      pageSize: 20,
    });
    const parsed = parseMemberListQueryState(new URLSearchParams(qs));
    expect(parsed).toEqual({
      search: "cafe",
      status: "blocked",
      verify: "verified",
      store: "has_store",
      privilege: "admin",
      origin: "kakao",
      page: 2,
      pageSize: 20,
    });
    expect(MEMBER_LIST_SEARCH_PLACEHOLDER_KO).toContain("매장 ID");
  });

  it("detail route is canonical", () => {
    expect(memberListDetailHref("abc")).toBe("/admin/users/abc");
  });
});

describe("P2 member list — P1 ActionPolicy consumption", () => {
  it("list page does not fork blocked/suspended action ifs", () => {
    const list = src("components/admin/users/AdminUserListPage.tsx");
    expect(list).not.toMatch(/if\s*\(.*blocked/);
    expect(list).not.toMatch(/if\s*\(.*suspended/);
    const policy = resolveMemberAdminActionPolicy({
      lifecycle: "BLOCKED",
      operator: {
        canModerate: true,
        canEditProfile: true,
        canResetPassword: true,
        canManagePrivilege: true,
        canWithdraw: true,
        canPurge: true,
        isSelf: false,
      },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    expect(policy.some((a) => a.id === "unblock" && a.visible)).toBe(true);
  });
});

describe("P2 member list — UI contracts", () => {
  it("list IA uses operator header and demotes deletion queue", () => {
    const list = src("components/admin/users/AdminUserListPage.tsx");
    expect(list).toContain("MEMBER_ADMIN_COPY.member_management");
    expect(list).toContain("/admin/users/deletion-requests");
    expect(list).toContain("/admin/users/ops-history");
    expect(list).not.toContain("<AdminDeletionRequestsQueue");
    expect(list).not.toContain('admin_users_tab_all');
    expect(list).not.toContain("onEditPermissions");
  });

  it("table columns and store href are operator contract", () => {
    const table = src("components/admin/users/AdminUserTable.tsx");
    expect(table).toContain("@회원 ID");
    expect(table).toContain("계정 상태");
    expect(table).toContain("매장");
    expect(table).toContain("관리 권한");
    expect(table).toContain("가입 방식");
    expect(table).toContain("memberListStoreCellLabel");
    expect(table).toContain("MEMBER_LIST_STORE_NONE_KO");
    expect(table).not.toContain("RowMenu");
    expect(table).not.toContain("/admin/stores?q=");
  });

  it("API keeps blocked status category and store id search", () => {
    const route = src("app/api/admin/users/route.ts");
    expect(route).toContain('return "blocked"');
    expect(route).toContain("statusCategoryCounts");
    expect(route).toContain('.eq("id", search)');
  });

  it("loading/empty/error markers are distinct", () => {
    const list = src("components/admin/users/AdminUserListPage.tsx");
    expect(list).toContain('data-member-list-state="error"');
    expect(list).toContain('data-member-list-state="loading"');
    expect(list).toContain('data-member-list-state={appliedSearch ? "search_empty" : "empty"}');
  });
});
