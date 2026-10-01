import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEMBER_ADMIN_CAPABILITY_CATALOG } from "@/lib/admin-users/member-admin-capability-catalog";
import { MEMBER_ADMIN_SCREEN_CATALOG } from "@/lib/admin-users/member-admin-screen-catalog";
import { resolveMemberAdminActionPolicy } from "@/lib/admin-users/member-admin-action-policy";
import {
  MEMBER_PRIVILEGE_AUTHORITY_TABLE,
  MEMBER_PRIVILEGE_ONE_ACTIVE_PER_USER_INDEX,
  MEMBER_PRIVILEGE_OPERATION_MATRIX,
  MEMBER_PRIVILEGE_STORAGE_ROLES,
  MEMBER_ADMIN_PRIVILEGE_COPY,
  memberPrivilegeLabelKo,
  memberPrivilegePresentationFromMembership,
  resolveMemberPrivilegeActionPolicy,
} from "@/lib/admin-users/member-admin-privilege-ssot";
import { memberListPrivilegeLabelKo } from "@/lib/admin-users/member-list-presentation";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import {
  executeMemberPrivilegePromote,
  executeMemberPrivilegeRevoke,
} from "@/lib/admin-users/member-admin-privilege-mutation";
import { isSuperAdminFromSnapshot } from "@/lib/admin-auth/admin-me-context";
import * as adminMembership from "@/lib/admin/admin-membership";
import * as adminUserServer from "@/lib/admin/admin-user-server";
import * as appendAudit from "@/lib/audit/append-audit-log";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const fullOp = {
  canModerate: true,
  canEditProfile: true,
  canResetPassword: true,
  canManagePrivilege: true,
  canWithdraw: true,
  canPurge: true,
  isSelf: false,
};

function mockSb(opts: { profile?: boolean } = {}) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.profile === false ? null : { id: "target-1" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      };
    },
  } as never;
}

describe("R6 Admin Privilege — authority & presentation", () => {
  it("preserves CAP 33 / Screens 28", () => {
    expect(MEMBER_ADMIN_CAPABILITY_CATALOG).toHaveLength(33);
    expect(MEMBER_ADMIN_SCREEN_CATALOG).toHaveLength(28);
  });

  it("canonical privilege authority is admin_memberships (not memberType)", () => {
    expect(MEMBER_PRIVILEGE_AUTHORITY_TABLE).toBe("admin_memberships");
    expect(MEMBER_PRIVILEGE_STORAGE_ROLES).toEqual(["admin", "super_admin"]);
    expect(MEMBER_PRIVILEGE_ONE_ACTIVE_PER_USER_INDEX).toBe(
      "admin_memberships_one_active_per_user_idx",
    );
    const migration = src("supabase/migrations/20261020120000_admin_memberships.sql");
    expect(migration).toContain("admin_memberships_one_active_per_user_idx");
    expect(migration).toContain("super_admin");
    const membership = src("lib/admin/admin-membership.ts");
    expect(membership).toMatch(/Application authority/);
    expect(membership).toContain("last_super_admin");
    const patch = src("lib/admin/users-patch-privilege.ts");
    expect(patch).toContain("never creates, updates, or revokes Admin authority");
    expect(patch).toContain("/api/admin/users/[id]/privilege");
  });

  it("normal member = no active membership; admin/super from storage roles", () => {
    expect(
      memberPrivilegePresentationFromMembership({ hasActiveAdminMembership: false }),
    ).toBe("member");
    expect(
      memberPrivilegePresentationFromMembership({
        hasActiveAdminMembership: true,
        role: "admin",
      }),
    ).toBe("admin");
    expect(
      memberPrivilegePresentationFromMembership({
        hasActiveAdminMembership: true,
        role: "super_admin",
      }),
    ).toBe("super_admin");
    expect(memberPrivilegeLabelKo("member")).toBe(MEMBER_ADMIN_COPY.privilege_member);
    expect(memberPrivilegeLabelKo("admin")).toBe(MEMBER_ADMIN_COPY.privilege_admin);
    expect(memberPrivilegeLabelKo("super_admin")).toBe(MEMBER_ADMIN_COPY.privilege_super_admin);
  });

  it("Member List privilege labels stay independent of memberType", () => {
    expect(
      memberListPrivilegeLabelKo({
        hasAdminMembership: false,
        isSuperAdmin: false,
        memberType: "premium",
      } as never),
    ).toBe(MEMBER_ADMIN_COPY.privilege_member);
    expect(
      memberListPrivilegeLabelKo({
        hasAdminMembership: true,
        isSuperAdmin: false,
      } as never),
    ).toBe(MEMBER_ADMIN_COPY.privilege_admin);
  });

  it("operation matrix forbids super / self invention", () => {
    expect(MEMBER_PRIVILEGE_OPERATION_MATRIX.NORMAL_TO_ADMIN).toBe("SUPPORTED");
    expect(MEMBER_PRIVILEGE_OPERATION_MATRIX.ADMIN_TO_NORMAL).toBe("SUPPORTED");
    expect(MEMBER_PRIVILEGE_OPERATION_MATRIX.ADMIN_TO_SUPER_ADMIN).toBe("FORBIDDEN");
    expect(MEMBER_PRIVILEGE_OPERATION_MATRIX.SUPER_ADMIN_TO_ADMIN).toBe("FORBIDDEN");
    expect(MEMBER_PRIVILEGE_OPERATION_MATRIX.NORMAL_TO_SUPER_ADMIN).toBe("FORBIDDEN");
    expect(MEMBER_PRIVILEGE_OPERATION_MATRIX.SELF_PROMOTE).toBe("FORBIDDEN");
    expect(MEMBER_PRIVILEGE_OPERATION_MATRIX.SELF_REVOKE).toBe("FORBIDDEN");
    expect(MEMBER_PRIVILEGE_OPERATION_MATRIX.LAST_SUPER_ADMIN_REVOKE).toBe("FORBIDDEN");
  });
});

describe("R6 Admin Privilege — ActionPolicy CTAs", () => {
  it("eligible promote / revoke CTAs; ineligible super/self blocked", () => {
    const promote = resolveMemberPrivilegeActionPolicy({
      canManagePrivilege: true,
      isSelf: false,
      targetPresentation: "member",
    });
    expect(promote.op).toBe("promote");
    expect(promote.enabled).toBe(true);
    expect(promote.capId).toBe("CAP-PRIV-PROMOTE");
    expect(promote.labelKo).toBe(MEMBER_ADMIN_PRIVILEGE_COPY.promote_cta);

    const revoke = resolveMemberPrivilegeActionPolicy({
      canManagePrivilege: true,
      isSelf: false,
      targetPresentation: "admin",
    });
    expect(revoke.op).toBe("revoke");
    expect(revoke.enabled).toBe(true);
    expect(revoke.capId).toBe("CAP-PRIV-REVOKE");

    const self = resolveMemberPrivilegeActionPolicy({
      canManagePrivilege: true,
      isSelf: true,
      targetPresentation: "admin",
    });
    expect(self.enabled).toBe(false);
    expect(self.disabledReasonKo).toBe(MEMBER_ADMIN_PRIVILEGE_COPY.cannot_change_self);

    const superT = resolveMemberPrivilegeActionPolicy({
      canManagePrivilege: true,
      isSelf: false,
      targetPresentation: "super_admin",
    });
    expect(superT.enabled).toBe(false);
    expect(superT.op).toBeNull();
  });

  it("detail ActionPolicy manage_privilege labels match promote/revoke", () => {
    const promote = resolveMemberAdminActionPolicy({
      lifecycle: "ACTIVE",
      operator: { ...fullOp, targetPrivilege: "member" },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    }).find((a) => a.id === "manage_privilege");
    expect(promote?.enabled).toBe(true);
    expect(promote?.labelKo).toBe("관리자 권한 부여");

    const revoke = resolveMemberAdminActionPolicy({
      lifecycle: "ACTIVE",
      operator: { ...fullOp, targetPrivilege: "admin" },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    }).find((a) => a.id === "manage_privilege");
    expect(revoke?.enabled).toBe(true);
    expect(revoke?.labelKo).toBe("관리자 권한 해제");

    const self = resolveMemberAdminActionPolicy({
      lifecycle: "ACTIVE",
      operator: { ...fullOp, isSelf: true, targetPrivilege: "admin" },
      hasStoreRelationship: false,
      passwordResetSupported: true,
    }).find((a) => a.id === "manage_privilege");
    expect(self?.enabled).toBe(false);
  });
});

describe("R6 Admin Privilege — UI / dialog / CAP wiring", () => {
  it("CAP-PRIV-PROMOTE/REVOKE are YES and S17 dialog consumes MemberAdminDialog", () => {
    const promote = MEMBER_ADMIN_CAPABILITY_CATALOG.find((c) => c.id === "CAP-PRIV-PROMOTE");
    const revoke = MEMBER_ADMIN_CAPABILITY_CATALOG.find((c) => c.id === "CAP-PRIV-REVOKE");
    expect(promote?.currentStatus).toBe("YES");
    expect(revoke?.currentStatus).toBe("YES");
    const dialog = src("components/admin/users/AdminMemberPrivilegeDialog.tsx");
    expect(dialog).toContain("MemberAdminDialog");
    expect(dialog).toContain('data-member-screen="S17"');
    expect(dialog).toContain("mutateMemberPrivilegeApi");
    expect(dialog).not.toMatch(/window\.confirm|AdminFormSheet/);
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toContain("AdminMemberPrivilegeDialog");
    expect(header).toContain("CAP-PRIV-PROMOTE");
    expect(header).toContain("CAP-PRIV-REVOKE");
    expect(header).toContain("onUpdated");
  });

  it("privilege API is lifecycle-safe", () => {
    const route = src("app/api/admin/users/[id]/privilege/route.ts");
    expect(route).toContain("executeMemberPrivilegePromote");
    expect(route).toContain("executeMemberPrivilegeRevoke");
    expect(route).toContain("requireSuperAdmin");
    expect(route).not.toMatch(/\bdeleted_at\b/);
    expect(route).not.toMatch(/\bmember_type\b/);
    expect(route).not.toMatch(/\bowner_user_id\b/);
    const mutation = src("lib/admin-users/member-admin-privilege-mutation.ts");
    expect(mutation).toContain("revokeActiveAdminMembership");
    expect(mutation).toContain("upsertActiveAdminMembership");
    expect(mutation).toContain("promote_to_admin");
    expect(mutation).toContain("revoke_admin_privilege");
    expect(mutation).toContain("lifecycle_unchanged");
    expect(mutation).not.toMatch(/\bdeleted_at\b/);
  });

  it("R4 memberType guard preserved; R5 store surfaces do not own privilege mutation", () => {
    const usersRoute = src("app/api/admin/users/[id]/route.ts");
    expect(usersRoute).toContain("member_type_not_via_profile_edit");
    const storeDialog = src("components/admin/users/AdminMemberStoreRelationDialog.tsx");
    expect(storeDialog).not.toMatch(/CAP-PRIV-PROMOTE|executeMemberPrivilege/);
    const storePanel = src("components/admin/users/AdminMemberStorePanel.tsx");
    expect(storePanel).not.toMatch(/CAP-PRIV-PROMOTE|executeMemberPrivilege|mutateMemberPrivilege/);
  });
});


  it("client super-admin detection follows membership role, not uiRole master", () => {
    expect(
      isSuperAdminFromSnapshot({
        userId: "u1",
        role: "admin",
        uiRole: "master",
        adminTier: "manager",
        permissions: [],
        loginId: "aaaa",
        displayName: "aaaa",
      }),
    ).toBe(false);
    expect(
      isSuperAdminFromSnapshot({
        userId: "u2",
        role: "super_admin",
        uiRole: "operator",
        adminTier: null,
        permissions: [],
        loginId: "super",
        displayName: "super",
      }),
    ).toBe(true);
    const meRoute = src("app/api/admin/me/route.ts");
    expect(meRoute).toContain("loadActiveAdminMembership");
    expect(meRoute).toMatch(/actor\.isSuperAdmin\s*\?\s*"master"/);
    expect(meRoute).not.toMatch(/adminTierToUiRole\(adminTier, profileRole\)/);
  });

describe("R6 Admin Privilege — server mutation guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(appendAudit, "appendAuditLog").mockResolvedValue(undefined);
    vi.spyOn(adminUserServer, "replaceStaffPermissions").mockResolvedValue(undefined as never);
    vi.spyOn(adminUserServer, "defaultPermissionsForUiRole").mockReturnValue(["users"] as never);
    vi.spyOn(adminUserServer, "uiRoleToAdminTier").mockReturnValue("operator");
  });

  it("rejects self promote/revoke", async () => {
    const selfPromote = await executeMemberPrivilegePromote(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "actor-1",
    });
    expect(selfPromote).toEqual({
      ok: false,
      error: "self_mutation_forbidden",
      status: 403,
    });

    const selfRevoke = await executeMemberPrivilegeRevoke(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "actor-1",
    });
    expect(selfRevoke).toEqual({
      ok: false,
      error: "self_mutation_forbidden",
      status: 403,
    });
  });

  it("rejects duplicate promote and revoke-of-normal", async () => {
    vi.spyOn(adminMembership, "loadActiveAdminMembership").mockResolvedValue({
      id: "m1",
      user_id: "target-1",
      role: "admin",
      status: "active",
      admin_tier: "operator",
      granted_at: null,
      granted_by: null,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      bootstrap_seed: false,
    } as never);
    vi.spyOn(adminMembership, "hasActiveAdminMembershipOrLegacyRole").mockResolvedValue(true);

    const dup = await executeMemberPrivilegePromote(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "target-1",
    });
    expect(dup).toEqual({ ok: false, error: "already_admin", status: 409 });

    vi.spyOn(adminMembership, "loadActiveAdminMembership").mockResolvedValue(null);
    const notAdmin = await executeMemberPrivilegeRevoke(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "target-1",
    });
    expect(notAdmin).toEqual({ ok: false, error: "not_admin", status: 409 });
  });

  it("rejects higher-privilege (super_admin) target mutation", async () => {
    vi.spyOn(adminMembership, "loadActiveAdminMembership").mockResolvedValue({
      id: "m1",
      user_id: "super-1",
      role: "super_admin",
      status: "active",
      admin_tier: null,
      granted_at: null,
      granted_by: null,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      bootstrap_seed: false,
    } as never);

    const promote = await executeMemberPrivilegePromote(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "super-1",
    });
    expect(promote).toEqual({
      ok: false,
      error: "cannot_modify_super_admin",
      status: 403,
    });

    const revoke = await executeMemberPrivilegeRevoke(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "super-1",
    });
    expect(revoke).toEqual({
      ok: false,
      error: "cannot_modify_super_admin",
      status: 403,
    });
  });

  it("promote writes membership + audit; revoke uses privilege-only membership revoke", async () => {
    vi.spyOn(adminMembership, "loadActiveAdminMembership").mockResolvedValue(null);
    vi.spyOn(adminMembership, "hasActiveAdminMembershipOrLegacyRole").mockResolvedValue(false);
    const upsert = vi
      .spyOn(adminMembership, "upsertActiveAdminMembership")
      .mockResolvedValue({ ok: true, membershipId: "m-new" });

    const promoted = await executeMemberPrivilegePromote(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "target-1",
    });
    expect(promoted.ok).toBe(true);
    expect(upsert).toHaveBeenCalled();
    expect(appendAudit.appendAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "promote_to_admin",
        target_id: "target-1",
        actor_id: "actor-1",
      }),
    );

    vi.spyOn(adminMembership, "loadActiveAdminMembership").mockResolvedValue({
      id: "m1",
      user_id: "target-1",
      role: "admin",
      status: "active",
      admin_tier: "operator",
      granted_at: null,
      granted_by: null,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      bootstrap_seed: false,
    } as never);
    const revokeFn = vi
      .spyOn(adminMembership, "revokeActiveAdminMembership")
      .mockResolvedValue({ ok: true });

    const revoked = await executeMemberPrivilegeRevoke(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "target-1",
    });
    expect(revoked.ok).toBe(true);
    expect(revokeFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "target-1", revokedBy: "actor-1" }),
    );
    expect(appendAudit.appendAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "revoke_admin_privilege",
        after_json: expect.objectContaining({ lifecycle_unchanged: true }),
      }),
    );
  });

  it("surfaces last_super_admin from membership revoke authority", async () => {
    vi.spyOn(adminMembership, "loadActiveAdminMembership").mockResolvedValue({
      id: "m1",
      user_id: "admin-1",
      role: "admin",
      status: "active",
      admin_tier: "operator",
      granted_at: null,
      granted_by: null,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      bootstrap_seed: false,
    } as never);
    // Role is admin so R6 path allows call; membership helper may still return last_super_admin
    // for super targets — prove mapping when helper returns that error.
    vi.spyOn(adminMembership, "revokeActiveAdminMembership").mockResolvedValue({
      ok: false,
      error: "last_super_admin",
    });

    const result = await executeMemberPrivilegeRevoke(mockSb(), {
      actor: { userId: "actor-1" },
      targetUserId: "admin-1",
    });
    expect(result).toEqual({ ok: false, error: "last_super_admin", status: 403 });
  });
});
