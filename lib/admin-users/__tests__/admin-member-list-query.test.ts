import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminMemberPrivilegeFilterPlan,
  adminMemberSearchFilterOps,
  adminMemberStatusFilterOps,
  adminMemberStoreFilterPlan,
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

describe("R2 orthogonal store + privilege filter plans", () => {
  it("store and privilege plans are independent (not collapsed relation)", () => {
    const store = adminMemberStoreFilterPlan("has_store", ["s1"]);
    const priv = adminMemberPrivilegeFilterPlan("admin", ["a1"]);
    expect(store.ops[0]).toMatchObject({ type: "in", column: "id", value: ["s1"] });
    expect(priv.ops[0]).toMatchObject({ type: "in", column: "id", value: ["a1"] });
    // Applying both does not require a single relation token.
    expect(store.ops[0]).not.toEqual(priv.ops[0]);
  });

  it("has_store with no owners is empty; admin with no admins is empty", () => {
    expect(adminMemberStoreFilterPlan("has_store", []).empty).toBe(true);
    expect(adminMemberPrivilegeFilterPlan("admin", []).empty).toBe(true);
  });

  it("no_store / member use not_in exclusion", () => {
    expect(adminMemberStoreFilterPlan("no_store", ["s1"]).ops[0]?.type).toBe("not_in");
    expect(adminMemberPrivilegeFilterPlan("member", ["a1"]).ops[0]?.type).toBe("not_in");
  });

  it("module no longer exports collapsed relation plan", () => {
    const src = readFileSync(join(process.cwd(), "lib/admin-users/admin-member-list-query.ts"), "utf8");
    expect(src).not.toMatch(/adminMemberRelationFilterPlan/);
    expect(src).not.toMatch(/AdminMemberRelationFilter/);
    expect(src).toMatch(/adminMemberStoreFilterPlan/);
    expect(src).toMatch(/adminMemberPrivilegeFilterPlan/);
  });
});

describe("adminMemberStatusFilterOps", () => {
  it("does not use phone_verified as account-state filter", () => {
    const src = JSON.stringify(adminMemberStatusFilterOps("active"));
    expect(src).not.toContain("phone_verified_at");
    expect(src).not.toContain("phone_verified");
  });

  it("suspended filter excludes blocked", () => {
    const src = JSON.stringify(adminMemberStatusFilterOps("suspended"));
    expect(src).toContain("status.eq.suspended");
    expect(src).not.toContain("status.eq.blocked");
  });
});

describe("route wiring authority", () => {
  it("list API uses orthogonal plans and never collapsed relation helpers", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8");
    expect(src).toMatch(/adminMemberStoreFilterPlan/);
    expect(src).toMatch(/adminMemberPrivilegeFilterPlan/);
    expect(src).not.toMatch(/adminMemberRelationFilterPlan/);
    expect(src).not.toMatch(/parseAdminMemberRelationFilter/);
    expect(src).not.toMatch(/memberMatchesRelationFilter/);
  });
});
