import { describe, expect, it } from "vitest";
import {
  countAdditiveRoleRelations,
  memberMatchesRelationFilter,
  parseAdminMemberRelationFilter,
  resolveAdminMemberRoleBadges,
} from "@/lib/admin-users/member-role-badges";

describe("resolveAdminMemberRoleBadges", () => {
  it("always includes member identity", () => {
    expect(
      resolveAdminMemberRoleBadges({ hasStoreOwnership: false, adminMembershipRole: null }),
    ).toEqual(["member"]);
  });

  it("adds store_owner without dropping member", () => {
    expect(
      resolveAdminMemberRoleBadges({ hasStoreOwnership: true, adminMembershipRole: null }),
    ).toEqual(["member", "store_owner"]);
  });

  it("allows member + store + admin overlap", () => {
    expect(
      resolveAdminMemberRoleBadges({ hasStoreOwnership: true, adminMembershipRole: "admin" }),
    ).toEqual(["member", "store_owner", "admin"]);
  });

  it("allows member + super_admin without exclusive overwrite", () => {
    expect(
      resolveAdminMemberRoleBadges({
        hasStoreOwnership: true,
        adminMembershipRole: "super_admin",
      }),
    ).toEqual(["member", "store_owner", "super_admin"]);
  });

  it("never invents store_staff", () => {
    const badges = resolveAdminMemberRoleBadges({
      hasStoreOwnership: true,
      adminMembershipRole: "admin",
    });
    expect(badges.join(",")).not.toMatch(/staff|employee/);
  });
});

describe("memberMatchesRelationFilter", () => {
  const overlap = ["member", "store_owner", "admin"] as const;

  it("store_owner filter includes admin overlap", () => {
    expect(memberMatchesRelationFilter(overlap, "store_owner")).toBe(true);
  });

  it("admin filter includes store overlap", () => {
    expect(memberMatchesRelationFilter(overlap, "admin")).toBe(true);
  });

  it("plain filter excludes store and admin relations", () => {
    expect(memberMatchesRelationFilter(overlap, "plain")).toBe(false);
    expect(memberMatchesRelationFilter(["member"], "plain")).toBe(true);
  });

  it("all includes everyone", () => {
    expect(memberMatchesRelationFilter(overlap, "all")).toBe(true);
    expect(memberMatchesRelationFilter(["member"], "all")).toBe(true);
  });
});

describe("parseAdminMemberRelationFilter", () => {
  it("maps legacy exclusive query tokens to additive filters", () => {
    expect(parseAdminMemberRelationFilter("member")).toBe("plain");
    expect(parseAdminMemberRelationFilter("store_manager")).toBe("store_owner");
    expect(parseAdminMemberRelationFilter("admin")).toBe("admin");
    expect(parseAdminMemberRelationFilter("")).toBe(null);
  });
});

describe("countAdditiveRoleRelations", () => {
  it("does not force counts to sum to total", () => {
    const counts = countAdditiveRoleRelations([
      ["member"],
      ["member", "store_owner"],
      ["member", "store_owner", "admin"],
      ["member", "super_admin"],
    ]);
    expect(counts.total).toBe(4);
    expect(counts.plain).toBe(1);
    expect(counts.storeOwner).toBe(2);
    expect(counts.admin).toBe(2);
    expect(counts.plain + counts.storeOwner + counts.admin).not.toBe(counts.total);
  });
});
