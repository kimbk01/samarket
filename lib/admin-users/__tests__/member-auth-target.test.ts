import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertMemberPasswordChangeAllowed } from "@/lib/admin-users/member-auth-target";

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

describe("assertMemberPasswordChangeAllowed", () => {
  it("blocks Super Admin targets regardless of actor", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb("super_admin") as never, {
      targetUserId: "target",
      actorIsSuperAdmin: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("forbidden_super_admin_target");
      expect(result.targetClass).toBe("super_admin");
    }
  });

  it("blocks admin targets for non-super actors", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb("admin") as never, {
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
      targetUserId: "target",
      actorIsSuperAdmin: true,
    });
    expect(result).toEqual({ ok: true, targetClass: "admin" });
  });

  it("allows general members for users-permission actors", async () => {
    const result = await assertMemberPasswordChangeAllowed(membershipSb(null) as never, {
      targetUserId: "target",
      actorIsSuperAdmin: false,
    });
    expect(result).toEqual({ ok: true, targetClass: "general_member" });
  });
});

describe("password route target guard contract", () => {
  it("auth PATCH uses shared helper and audit log", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/auth/route.ts"), "utf8");
    expect(src).toMatch(/assertMemberPasswordChangeAllowed/);
    expect(src).toMatch(/appendAuditLog/);
    expect(src).toMatch(/admin_password_reset/);
  });

  it("member PATCH password branch uses shared helper", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/route.ts"), "utf8");
    expect(src).toMatch(/assertMemberPasswordChangeAllowed/);
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
});
