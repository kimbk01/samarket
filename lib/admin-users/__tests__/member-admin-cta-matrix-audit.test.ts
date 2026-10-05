import { describe, expect, it } from "vitest";
import { resolveMemberAdminActionPolicy } from "@/lib/admin-users/member-admin-action-policy";

const fullOp = {
  canModerate: true,
  canEditProfile: true,
  canResetPassword: true,
  canManagePrivilege: true,
  canWithdraw: true,
  canPurge: true,
  isSelf: false,
} as const;

function ids(ctx: Parameters<typeof resolveMemberAdminActionPolicy>[0]) {
  return resolveMemberAdminActionPolicy(ctx)
    .filter((a) => a.visible && a.enabled)
    .map((a) => a.id);
}

describe("CTA matrix audit by target type", () => {
  it("SA self: password enabled; moderation disabled", () => {
    const d = resolveMemberAdminActionPolicy({
      lifecycle: "ACTIVE",
      operator: { ...fullOp, isSelf: true, targetPrivilege: "super_admin", targetIsSuperAdmin: true },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    const pw = d.find((a) => a.id === "manage_password");
    expect(pw?.visible).toBe(true);
    expect(pw?.enabled).toBe(true);
    expect(d.find((a) => a.id === "suspend")?.enabled).toBe(false);
    expect(d.find((a) => a.id === "block")?.enabled).toBe(false);
  });

  it("SA other: password hidden; staff path separate", () => {
    const d = resolveMemberAdminActionPolicy({
      lifecycle: "ACTIVE",
      operator: { ...fullOp, isSelf: false, targetPrivilege: "super_admin", targetIsSuperAdmin: true },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    expect(d.find((a) => a.id === "manage_password")?.visible).toBe(false);
  });

  it("general admin: member password hidden", () => {
    const d = resolveMemberAdminActionPolicy({
      lifecycle: "ACTIVE",
      operator: { ...fullOp, targetPrivilege: "admin", targetIsSuperAdmin: false },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    expect(d.find((a) => a.id === "manage_password")?.visible).toBe(false);
  });

  it("general member: password visible", () => {
    const d = resolveMemberAdminActionPolicy({
      lifecycle: "ACTIVE",
      operator: { ...fullOp, targetPrivilege: "member" },
      hasStoreRelationship: true,
      passwordResetSupported: true,
    });
    expect(d.find((a) => a.id === "manage_password")?.visible).toBe(true);
    expect(d.find((a) => a.id === "manage_store")?.visible).toBe(true);
  });

  it("non-SA operator cannot see SA password path", () => {
    const d = resolveMemberAdminActionPolicy({
      lifecycle: "ACTIVE",
      operator: {
        ...fullOp,
        canManagePrivilege: false,
        isSelf: true,
        targetPrivilege: "super_admin",
        targetIsSuperAdmin: true,
      },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    expect(d.find((a) => a.id === "manage_password")?.visible).toBe(false);
  });

  it("withdrawn: purge visible when canPurge", () => {
    const d = resolveMemberAdminActionPolicy({
      lifecycle: "WITHDRAWN",
      operator: { ...fullOp, targetPrivilege: "member" },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    expect(d.find((a) => a.id === "purge")?.visible).toBe(true);
    expect(d.find((a) => a.id === "manage_password")?.visible).toBe(false);
  });
});
