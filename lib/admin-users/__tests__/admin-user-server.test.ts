import { describe, expect, it } from "vitest";
import {
  adminTierToUiRole,
  uiRoleToAdminTier,
  isSuperAdminRole,
  permissionKeyAllowed,
} from "@/lib/admin/admin-user-server";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";

describe("isSuperAdminRole", () => {
  it("accepts super_admin and master alias", () => {
    expect(isSuperAdminRole("super_admin")).toBe(true);
    expect(isSuperAdminRole("master")).toBe(true);
    expect(isSuperAdminRole("admin")).toBe(false);
  });
});

describe("admin tier mapping", () => {
  it("maps super_admin profile to master ui role", () => {
    expect(adminTierToUiRole(null, "super_admin")).toBe("master");
  });

  it("maps manager tier", () => {
    expect(adminTierToUiRole("manager", "admin")).toBe("manager");
  });

  it("maps operator default", () => {
    expect(adminTierToUiRole(null, "admin")).toBe("operator");
    expect(uiRoleToAdminTier("operator")).toBe("operator");
  });
});

describe("permissionKeyAllowed", () => {
  const usersOnly: AdminPermissionKey[] = ["users"];

  it("allows users_edit_membership when users is granted", () => {
    expect(permissionKeyAllowed(usersOnly, "users_edit_membership")).toBe(true);
  });

  it("denies point without explicit key", () => {
    expect(permissionKeyAllowed(usersOnly, "point")).toBe(false);
  });
});
