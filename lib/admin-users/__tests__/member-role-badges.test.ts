import { describe, expect, it } from "vitest";
import {
  adminMembershipRoleFromRow,
  memberHasOrthogonalStoreAndPrivilege,
  resolveAdminMemberRoleBadges,
} from "@/lib/admin-users/member-role-badges";

describe("resolveAdminMemberRoleBadges", () => {
  it("keeps member base and adds store/admin without overwrite", () => {
    expect(
      resolveAdminMemberRoleBadges({
        hasStoreOwnership: true,
        adminMembershipRole: "admin",
      }),
    ).toEqual(["member", "store_owner", "admin"]);
  });

  it("adds super_admin without dropping store", () => {
    expect(
      resolveAdminMemberRoleBadges({
        hasStoreOwnership: true,
        adminMembershipRole: "super_admin",
      }),
    ).toEqual(["member", "store_owner", "super_admin"]);
  });

  it("plain member is only member", () => {
    expect(
      resolveAdminMemberRoleBadges({
        hasStoreOwnership: false,
        adminMembershipRole: null,
      }),
    ).toEqual(["member"]);
  });
});

describe("orthogonal store + privilege", () => {
  it("proves store and privilege axes coexist", () => {
    const badges = resolveAdminMemberRoleBadges({
      hasStoreOwnership: true,
      adminMembershipRole: "admin",
    });
    expect(memberHasOrthogonalStoreAndPrivilege(badges)).toBe(true);
  });
});

describe("adminMembershipRoleFromRow", () => {
  it("maps membership role tokens", () => {
    expect(adminMembershipRoleFromRow("super_admin")).toBe("super_admin");
    expect(adminMembershipRoleFromRow("master")).toBe("super_admin");
    expect(adminMembershipRoleFromRow("admin")).toBe("admin");
    expect(adminMembershipRoleFromRow("member")).toBe(null);
  });
});
