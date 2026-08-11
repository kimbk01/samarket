import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminMemberRelationFilterPlan,
  adminMemberSearchFilterOps,
  adminMemberStatusFilterOps,
  buildProfileTextSearchOr,
  isAdminMemberUuidSearch,
  normalizeAdminMemberSearchToken,
  parseAdminMemberListPage,
} from "@/lib/admin-users/admin-member-list-query";

describe("isAdminMemberUuidSearch", () => {
  it("accepts canonical UUID", () => {
    expect(isAdminMemberUuidSearch("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("rejects nickname and partial id", () => {
    expect(isAdminMemberUuidSearch("dibay")).toBe(false);
    expect(isAdminMemberUuidSearch("11111111-1111-4111")).toBe(false);
  });
});

describe("parseAdminMemberListPage", () => {
  it("defaults and clamps", () => {
    expect(parseAdminMemberListPage(null, null)).toEqual({ page: 1, pageSize: 10, from: 0, to: 9 });
    expect(parseAdminMemberListPage("2", "20")).toEqual({ page: 2, pageSize: 20, from: 20, to: 39 });
    expect(parseAdminMemberListPage("0", "999")).toEqual({ page: 1, pageSize: 50, from: 0, to: 49 });
  });
});

describe("buildProfileTextSearchOr", () => {
  it("searches phone and can union store-owner ids", () => {
    const or = buildProfileTextSearchOr("cafe", {
      extraIds: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(or).toContain("phone.ilike.%cafe%");
    expect(or).toContain("id.in.(11111111-1111-4111-8111-111111111111)");
    expect(or).not.toMatch(/(?:^|,)id\.ilike/);
  });
});

describe("adminMemberSearchFilterOps", () => {
  it("uses eq(id) for UUID and never ilike on id", () => {
    const ops = adminMemberSearchFilterOps("11111111-1111-4111-8111-111111111111");
    expect(ops).toEqual([{ type: "eq", column: "id", value: "11111111-1111-4111-8111-111111111111" }]);
  });

  it("strips @ for dibay id text search", () => {
    expect(normalizeAdminMemberSearchToken("@dibay_user")).toBe("dibay_user");
  });
});

describe("adminMemberRelationFilterPlan", () => {
  it("does not treat plain as identity SSOT — it only excludes store/admin ids", () => {
    const plan = adminMemberRelationFilterPlan("plain", ["s1"], ["a1"]);
    expect(plan.empty).toBe(false);
    expect(plan.ops).toEqual([{ type: "not_in", column: "id", value: "(s1,a1)" }]);
  });

  it("store_owner with no owners is empty", () => {
    expect(adminMemberRelationFilterPlan("store_owner", [], []).empty).toBe(true);
  });
});

describe("adminMemberStatusFilterOps", () => {
  it("does not use phone_verified_at as activity", () => {
    const src = JSON.stringify(adminMemberStatusFilterOps("active"));
    expect(src).not.toContain("phone_verified_at");
  });
});

describe("admin users list route Slice 2", () => {
  it("paginates in SQL and uses UUID eq", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8");
    expect(src).toMatch(/\.range\(from, to\)/);
    expect(src).toMatch(/isAdminMemberUuidSearch/);
    expect(src).toMatch(/adminMemberSearchFilterOps/);
    expect(src).not.toMatch(/users\.slice\(/);
    expect(src).not.toMatch(/memberMatchesRelationFilter/);
  });

  it("list page sends page/pageSize and does not client-slice", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/users/AdminUserListPage.tsx"), "utf8");
    expect(src).toMatch(/params\.set\("page"/);
    expect(src).toMatch(/params\.set\("pageSize"/);
    expect(src).not.toMatch(/users\.slice\(/);
    expect(src).toMatch(/admin_users_tab_all/);
  });
});
