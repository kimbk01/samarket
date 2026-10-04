/**
 * G7/G9: member S16 vs staff EditAdminForm path separation + forbidden_* mapping.
 * Non-mutating contract tests only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveMemberAdminActionPolicy,
  type MemberAdminActionContext,
  type MemberAdminOperatorAuthorization,
} from "@/lib/admin-users/member-admin-action-policy";

const fullOp: MemberAdminOperatorAuthorization = {
  canModerate: true,
  canEditProfile: true,
  canResetPassword: true,
  canManagePrivilege: true,
  canWithdraw: true,
  canPurge: true,
  isSelf: false,
};

function ctx(
  lifecycle: MemberAdminActionContext["lifecycle"],
  partial: Partial<MemberAdminActionContext> = {},
): MemberAdminActionContext {
  return {
    lifecycle,
    operator: fullOp,
    hasStoreRelationship: false,
    passwordResetSupported: true,
    ...partial,
  };
}

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("G7 member password policy vs server target guard", () => {
  it("member path CTA only for general members when reset supported", () => {
    const member = resolveMemberAdminActionPolicy(
      ctx("ACTIVE", { operator: { ...fullOp, targetPrivilege: "member" } }),
    ).find((a) => a.id === "manage_password");
    expect(member?.visible).toBe(true);
    expect(member?.enabled).toBe(true);
  });

  it("hides member S16 for admin and super_admin targets (staff path separate)", () => {
    for (const targetPrivilege of ["admin", "super_admin"] as const) {
      const d = resolveMemberAdminActionPolicy(
        ctx("ACTIVE", {
          operator: {
            ...fullOp,
            targetPrivilege,
            targetIsSuperAdmin: targetPrivilege === "super_admin",
          },
        }),
      ).find((a) => a.id === "manage_password");
      expect(d?.visible).toBe(false);
    }
  });

  it("PasswordDialog maps forbidden_* without removing finally pending release", () => {
    const dialog = src("components/admin/users/AdminMemberPasswordDialog.tsx");
    expect(dialog).toMatch(/forbidden_admin_target/);
    expect(dialog).toMatch(/forbidden_super_admin_target/);
    expect(dialog).toMatch(/finally/);
    expect(dialog).toMatch(/setPending\(false\)/);
  });

  it("server assertMemberPasswordChangeAllowed remains for admin/SA protection", () => {
    const guard = src("lib/admin-users/member-auth-target.ts");
    expect(guard).toMatch(/forbidden_super_admin_target/);
    expect(guard).toMatch(/forbidden_admin_target/);
    expect(guard).toMatch(/actorIsSuperAdmin/);
    expect(guard).toMatch(/membership_lookup_failed/);
    expect(guard).toMatch(/membership_unavailable/);
    expect(guard).not.toMatch(/loadActiveAdminMembership\(sb, targetUserId\)\.catch\(\(\) => null\)/);
  });

  it("PasswordDialog maps membership fail-closed errors", () => {
    const dialog = src("components/admin/users/AdminMemberPasswordDialog.tsx");
    expect(dialog).toMatch(/membership_lookup_failed/);
    expect(dialog).toMatch(/membership_unavailable/);
  });
});

describe("G9 staff EditAdminForm detail wiring (candidate B)", () => {
  it("MasterHeader mounts EditAdminForm for SA→admin without remounting list AdminStaffTable", () => {
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toMatch(/import \{ EditAdminForm \}/);
    expect(header).toMatch(/data-member-cta="staff_edit"/);
    expect(header).toMatch(/canEditStaff/);
    expect(header).toMatch(/privilegePresentation === "admin"/);
    expect(header).toMatch(/<EditAdminForm/);

    const listPage = src("components/admin/users/AdminUserListPage.tsx");
    expect(listPage).not.toMatch(/<AdminStaffTable/);
  });

  it("EditAdminForm keeps master password UI excluded and SA-only submit", () => {
    const form = src("components/admin/users/EditAdminForm.tsx");
    expect(form).toMatch(/staff\.role !== "master"/);
    expect(form).toMatch(/isSuperAdmin/);
    expect(form).toMatch(/updateAdminStaffApi/);
  });

  it("staff password API remains requireSuperAdmin + forbids SA target", () => {
    const route = src("app/api/admin/staff/[id]/route.ts");
    expect(route).toMatch(/requireSuperAdmin/);
    expect(route).toMatch(/forbidden_super_admin_target/);
    expect(route).toMatch(/admin_password_reset/);
  });
});
