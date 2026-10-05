import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertMemberPasswordChangeAllowed,
  classifyMemberAuthTarget,
} from "@/lib/admin-users/member-auth-target";

function membershipSb(role: "admin" | "super_admin" | null) {
  return {
    from(table: string) {
      if (table !== "admin_memberships") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      if (!role) return { data: null, error: null };
                      return {
                        data: {
                          id: "m1",
                          user_id: "target",
                          role,
                          status: "active",
                          admin_tier: role === "admin" ? "operator" : null,
                          granted_at: "",
                          granted_by: null,
                          revoked_at: null,
                          revoked_by: null,
                          revoke_reason: null,
                          bootstrap_seed: false,
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function errorSb(message: string) {
  return {
    from(table: string) {
      if (table !== "admin_memberships") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: null, error: { message } };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("assertMemberPasswordChangeAllowed", () => {
  it("blocks Super Admin targets for non-super actors", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb("super_admin") as never, {
      actorUserId: "actor",
      targetUserId: "target",
      actorIsSuperAdmin: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("forbidden_super_admin_target");
      expect(result.targetClass).toBe("super_admin");
    }
  });

  it("allows Super Admin self password for Super Admin actors", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb("super_admin") as never, {
      actorUserId: "target",
      targetUserId: "target",
      actorIsSuperAdmin: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.targetClass).toBe("super_admin");
    }
  });

  it("blocks other Super Admin password even for Super Admin actors", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb("super_admin") as never, {
      actorUserId: "actor",
      targetUserId: "target",
      actorIsSuperAdmin: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("forbidden_other_super_admin_target");
      expect(result.targetClass).toBe("super_admin");
    }
  });

  it("blocks admin targets for non-super actors", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb("admin") as never, {
      actorUserId: "actor",
      targetUserId: "target",
      actorIsSuperAdmin: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("forbidden_admin_target");
      expect(result.targetClass).toBe("admin");
    }
  });

  it("allows admin targets for Super Admin actors", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb("admin") as never, {
      actorUserId: "actor",
      targetUserId: "target",
      actorIsSuperAdmin: true,
    });
    expect(result).toEqual({ ok: true, targetClass: "admin" });
  });

  it("allows general members only when membership absence is confirmed", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb(null) as never, {
      actorUserId: "actor",
      targetUserId: "target",
      actorIsSuperAdmin: false,
    });
    expect(result).toEqual({ ok: true, targetClass: "general_member" });
  });

  it("FAIL-CLOSED: DB lookup error denies password change (not general_member)", async () => {
    const classified = await classifyMemberAuthTarget(errorSb("simulated_db_error") as never, "target");
    expect(classified.ok).toBe(false);
    if (!classified.ok) {
      expect(classified.error).toBe("membership_lookup_failed");
      expect(classified.status).toBe(503);
    }

    const denied = await assertMemberPasswordChangeAllowed(errorSb("simulated_db_error") as never, {
      actorUserId: "actor",
      targetUserId: "target",
      actorIsSuperAdmin: false,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("membership_lookup_failed");
      expect(denied.status).toBe(503);
    }
  });

  it("FAIL-CLOSED: missing membership table denies password change", async () => {
    const denied = await assertMemberPasswordChangeAllowed(
      errorSb('relation "admin_memberships" does not exist') as never,
      { actorUserId: "actor", targetUserId: "target", actorIsSuperAdmin: true },
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("membership_unavailable");
      expect(denied.status).toBe(503);
    }
  });

  it("FAIL-CLOSED: permission/RLS error denies password change", async () => {
    const denied = await assertMemberPasswordChangeAllowed(
      errorSb("permission denied for table admin_memberships") as never,
      { actorUserId: "actor", targetUserId: "target", actorIsSuperAdmin: false },
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("membership_unavailable");
      expect(denied.status).toBe(503);
    }
  });
});

describe("password route target guard contract", () => {
  it("auth PATCH uses shared helper and audit log", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/auth/route.ts"), "utf8");
    expect(src).toMatch(/assertMemberPasswordChangeAllowed/);
    expect(src).toMatch(/appendAuditLog/);
    expect(src).toMatch(/PASSWORD_TEMP_SET/);
    expect(src).toMatch(/PASSWORD_TEMP_SET_DENIED/);
  });

  it("member PATCH password branch uses shared helper", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/route.ts"), "utf8");
    expect(src).toMatch(/assertMemberPasswordChangeAllowed/);
    expect(src).toMatch(/PASSWORD_TEMP_SET_DENIED/);
  });

  it("create uses users permission gate", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/create/route.ts"), "utf8");
    expect(src).toMatch(/requireAdminPermission\("users"\)/);
    expect(src).not.toMatch(/requireAdminApiUser/);
  });

  it("cleanup is Super Admin only", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/cleanup/route.ts"), "utf8");
    expect(src).toMatch(/requireSuperAdmin/);
    expect(src).not.toMatch(/requireAdminApiUser/);
  });

  it("member-auth-target does not collapse probe failure into general_member via catch-null", () => {
    const src = readFileSync(join(process.cwd(), "lib/admin-users/member-auth-target.ts"), "utf8");
    expect(src).not.toMatch(/loadActiveAdminMembership\(sb, targetUserId\)\.catch\(\(\) => null\)/);
    expect(src).toMatch(/membership_lookup_failed/);
    expect(src).toMatch(/membership_unavailable/);
    expect(src).toMatch(/probeActiveAdminMembershipForAuthTarget/);
  });
});
