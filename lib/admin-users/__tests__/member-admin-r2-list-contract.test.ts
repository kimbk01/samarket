import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminMemberOriginFilterOps,
  adminMemberPrivilegeFilterPlan,
  adminMemberStatusFilterOps,
  adminMemberStoreFilterPlan,
  adminMemberVerificationFilterOps,
  buildProfileTextSearchOr,
} from "@/lib/admin-users/admin-member-list-query";
import {
  MEMBER_ADMIN_CAPABILITY_CATALOG,
  MEMBER_ADMIN_CAPABILITY_CATALOG_COUNT,
  MEMBER_ADMIN_CAPABILITY_IDS,
} from "@/lib/admin-users/member-admin-capability-catalog";
import {
  MEMBER_ADMIN_SCREEN_CATALOG,
  MEMBER_ADMIN_SCREEN_CATALOG_COUNT,
} from "@/lib/admin-users/member-admin-screen-catalog";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import {
  MEMBER_LIST_AT_ID_COLUMN_KO,
  MEMBER_LIST_SEARCH_PLACEHOLDER_KO,
  MEMBER_LIST_STORE_NONE_KO,
  MEMBER_LIST_VERIFY_DONE_KO,
  MEMBER_LIST_VERIFY_INCOMPLETE_KO,
  buildMemberListQueryString,
  memberListPrivilegeLabelKo,
  memberListSignupOriginLabelKo,
  memberListStoreCellLabel,
  memberListVerificationLabelKo,
  parseMemberListQueryState,
} from "@/lib/admin-users/member-list-presentation";
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

describe("R2 member list — catalog guards", () => {
  it("keeps CAP 33 and Screens 28", () => {
    expect(MEMBER_ADMIN_CAPABILITY_CATALOG_COUNT).toBe(33);
    expect(MEMBER_ADMIN_CAPABILITY_CATALOG).toHaveLength(33);
    expect(new Set(MEMBER_ADMIN_CAPABILITY_IDS).size).toBe(33);
    expect(MEMBER_ADMIN_SCREEN_CATALOG_COUNT).toBe(28);
    expect(MEMBER_ADMIN_SCREEN_CATALOG).toHaveLength(28);
  });

  it("marks five list filter CAPs as YES", () => {
    for (const id of [
      "CAP-LIST-FILTER-STATUS",
      "CAP-LIST-FILTER-VERIFY",
      "CAP-LIST-FILTER-STORE",
      "CAP-LIST-FILTER-PRIV",
      "CAP-LIST-FILTER-ORIGIN",
    ]) {
      const row = MEMBER_ADMIN_CAPABILITY_CATALOG.find((r) => r.id === id);
      expect(row?.currentStatus).toBe("YES");
    }
  });
});

describe("R2 member list — columns and identity", () => {
  it("requires @회원 ID / Store / privilege columns and forbids 관계", () => {
    const table = src("components/admin/users/AdminUserTable.tsx");
    const filter = src("components/admin/users/AdminUserFilterBar.tsx");
    expect(table).toContain(MEMBER_LIST_AT_ID_COLUMN_KO);
    expect(table).toContain("memberListVerificationLabelKo");
    expect(table).toContain("memberListStoreCellLabel");
    expect(table).toContain("memberListPrivilegeLabelKo");
    expect(table).toContain("memberAdminCtaClass");
    expect(table).not.toContain("관계");
    expect(table).not.toContain("회원 구분");
    expect(table).not.toContain("표시만");
    expect(table).toContain("AdminManagementSelectionCheckbox");
    expect(filter).not.toContain("관계 전체");
    expect(filter).toContain('data-member-list-filter="status"');
    expect(filter).toContain('data-member-list-filter="verify"');
    expect(filter).toContain('data-member-list-filter="store"');
    expect(filter).toContain('data-member-list-filter="privilege"');
    expect(filter).toContain('data-member-list-filter="origin"');
  });

  it("shows Store name + #id and 일반 회원 privilege", () => {
    expect(memberListPrivilegeLabelKo(baseUser())).toBe(MEMBER_ADMIN_COPY.privilege_member);
    const cell = memberListStoreCellLabel(
      baseUser({
        storeRelation: {
          count: 1,
          hasApproved: true,
          stores: [{ id: "store-1", name: "한식당", approvalStatus: "approved", isVisible: true, connectedAt: null }],
        },
      }),
    );
    expect(cell.name).toBe("한식당");
    expect(cell.storeId).toBe("store-1");
    expect(cell.href).toBe("/admin/business/store-1");
    expect(MEMBER_LIST_STORE_NONE_KO).toBe("매장 없음");
  });

  it("maps verification binary and signup copy", () => {
    expect(memberListVerificationLabelKo(baseUser({ phoneVerified: true }))).toBe(MEMBER_LIST_VERIFY_DONE_KO);
    expect(memberListVerificationLabelKo(baseUser({ phoneVerified: false }))).toBe(
      MEMBER_LIST_VERIFY_INCOMPLETE_KO,
    );
    expect(memberListSignupOriginLabelKo("manual")).toBe(MEMBER_ADMIN_COPY.origin_admin_manual);
    expect(memberListSignupOriginLabelKo("kakao")).toBe(MEMBER_ADMIN_COPY.origin_kakao);
  });
});

describe("R2 member list — search field contract", () => {
  it("covers all supported profile/store search fields", () => {
    const or = buildProfileTextSearchOr("cafe", {
      extraIds: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(or).toContain("display_name.ilike.");
    expect(or).toContain("nickname.ilike.");
    expect(or).toContain("dibay_id.ilike.");
    expect(or).toContain("username.ilike.");
    expect(or).toContain("email.ilike.");
    expect(or).toContain("phone.ilike.");
    expect(or).toContain("auth_login_email.ilike.");
    expect(or).toContain("id.in.");
    expect(MEMBER_LIST_SEARCH_PLACEHOLDER_KO).toContain("@회원 ID");
    expect(MEMBER_LIST_SEARCH_PLACEHOLDER_KO).toContain("매장 ID");
  });
});

describe("R2 member list — five filter axes", () => {
  it("keeps account state independent of verification", () => {
    const active = JSON.stringify(adminMemberStatusFilterOps("active"));
    expect(active).not.toContain("phone_verified");
    const blocked = JSON.stringify(adminMemberStatusFilterOps("blocked"));
    const suspended = JSON.stringify(adminMemberStatusFilterOps("suspended"));
    expect(blocked).toContain("status.eq.blocked");
    expect(blocked).not.toContain("status.eq.suspended");
    expect(suspended).toContain("status.eq.suspended");
    expect(suspended).not.toContain("status.eq.blocked");
  });

  it("builds server ops for verify/store/privilege/origin", () => {
    expect(JSON.stringify(adminMemberVerificationFilterOps("verified"))).toContain("phone_verified");
    expect(JSON.stringify(adminMemberVerificationFilterOps("unverified"))).toContain("phone_verified.eq.false");
    expect(adminMemberStoreFilterPlan("has_store", ["o1"]).ops[0]).toMatchObject({ type: "in" });
    expect(adminMemberStoreFilterPlan("no_store", ["o1"]).ops[0]?.type).toBe("not_in");
    expect(adminMemberPrivilegeFilterPlan("admin", ["a1"]).ops[0]).toMatchObject({ type: "in" });
    expect(adminMemberPrivilegeFilterPlan("member", ["a1"]).ops[0]?.type).toBe("not_in");
    expect(JSON.stringify(adminMemberOriginFilterOps("kakao"))).toContain("kakao");
    expect(JSON.stringify(adminMemberOriginFilterOps("manual"))).toContain("manual");
  });
});

describe("R2 member list — URL state authority", () => {
  it("round-trips independent axes without role/관계", () => {
    const qs = buildMemberListQueryString({
      search: "cafe",
      status: "blocked",
      verify: "verified",
      store: "has_store",
      privilege: "admin",
      origin: "kakao",
      joinedFrom: "",
      joinedTo: "",
      sort: "created_at_desc",
      page: 2,
      pageSize: 20,
    });
    expect(qs).not.toContain("role=");
    const parsed = parseMemberListQueryState(new URLSearchParams(qs));
    expect(parsed).toEqual({
      search: "cafe",
      status: "blocked",
      verify: "verified",
      store: "has_store",
      privilege: "admin",
      origin: "kakao",
      joinedFrom: "",
      joinedTo: "",
      sort: "created_at_desc",
      page: 2,
      pageSize: 20,
    });
  });
});

describe("R2 member list — API / UI wiring", () => {
  it("API applies five independent filter params", () => {
    const route = src("app/api/admin/users/route.ts");
    expect(route).toContain("adminMemberVerificationFilterOps");
    expect(route).toContain("adminMemberStoreFilterPlan");
    expect(route).toContain("adminMemberPrivilegeFilterPlan");
    expect(route).toContain("adminMemberOriginFilterOps");
    expect(route).toContain('searchParams.get("verify")');
    expect(route).toContain('searchParams.get("store")');
    expect(route).toContain('searchParams.get("privilege")');
    expect(route).toContain('searchParams.get("origin")');
    expect(route).toContain('searchParams.get("joinedFrom")');
    expect(route).toContain('searchParams.get("sort")');
    expect(route).not.toContain("parseAdminMemberRelationFilter");
    expect(route).toContain("Account state is independent of verification");
  });

  it("list page wires URL filters and forbids collapsed 관계", () => {
    const list = src("components/admin/users/AdminUserListPage.tsx");
    expect(list).toContain("verifyFilter");
    expect(list).toContain("storeFilter");
    expect(list).toContain("privilegeFilter");
    expect(list).toContain("originFilter");
    expect(list).not.toContain("roleFilter");
    expect(list).not.toContain("관계");
    expect(list).toContain('data-member-list-state="error"');
    expect(list).toContain('data-member-list-state="loading"');
    expect(list).toContain('data-member-list-state={appliedSearch ? "search_empty" : "empty"}');
  });
});
