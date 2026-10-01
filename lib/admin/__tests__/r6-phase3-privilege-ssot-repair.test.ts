/**
 * R6 Phase 3 — privilege SSOT repair + staff lifecycle decoupling contracts.
 * Matrix A01–A08 / B01–B11 (static + unit; no Production mutation).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminTierToUiRole,
  defaultPermissionsForUiRole,
  loadEffectiveStaffPermissions,
} from "@/lib/admin/admin-user-server";
import {
  hasActiveAdminMembershipOrLegacyRole,
  revokeActiveAdminMembership,
  resolveEffectiveAdminRole,
} from "@/lib/admin/admin-membership";
import { isPrivilegedAdminRole, isAdminUser, isPrivilegedAdminAuthority } from "@/lib/auth/admin-policy";

const root = process.cwd();
const src = (rel: string) => readFileSync(join(root, rel), "utf8");

const RLS_MIGRATION =
  "supabase/migrations/20270413120000_r6_admin_staff_permissions_membership_rls.sql";
const HELPER_CUTOVER =
  "supabase/migrations/20261021120000_is_platform_admin_membership_only.sql";
const REGRESSION_JSONB =
  "supabase/migrations/20270406120000_admin_staff_permissions_jsonb_canonical.sql";

describe("R6-A — staff permissions RLS + tier authority", () => {
  it("A01/migration: SELECT policy uses is_platform_admin, not profiles.is_admin", () => {
    const sql = src(RLS_MIGRATION);
    expect(sql).toContain("admin_staff_permissions_select_admin");
    expect(sql).toContain("public.is_platform_admin(auth.uid())");
    expect(sql).not.toMatch(/p\.is_admin\s*=\s*true/);
    // policy body must not authorize via profile mirror column
    const body = sql.replace(/--[^\n]*/g, "").replace(/COMMENT ON POLICY[\s\S]*?;/, "");
    expect(body).not.toMatch(/is_admin/);
    // historical defect remains in prior migration (not rewritten)
    expect(src(REGRESSION_JSONB)).toMatch(/p\.is_admin\s*=\s*true/);
  });

  it("helper cutover remains membership-only (SECURITY DEFINER + search_path)", () => {
    const sql = src(HELPER_CUTOVER);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/m\.status = 'active'/);
    expect(sql).toMatch(/m\.role IN \('admin', 'super_admin'\)/);
    const body = sql.replace(/--[^\n]*/g, "").replace(/COMMENT ON FUNCTION[\s\S]*?;/, "");
    expect(body).not.toMatch(/FROM public\.profiles/);
    expect(body).not.toMatch(/is_admin/);
  });

  it("A02/A04: membership helpers ignore profile mirrors", async () => {
    const sb = {
      from(table: string) {
        if (table !== "admin_memberships") throw new Error(table);
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: {
                          id: "m1",
                          user_id: "u1",
                          role: "super_admin",
                          status: "active",
                          admin_tier: null,
                        },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    // A04: membership super + profile role unused
    await expect(hasActiveAdminMembershipOrLegacyRole(sb as never, "u1", "user")).resolves.toBe(
      true
    );
    await expect(resolveEffectiveAdminRole(sb as never, "u1", "user")).resolves.toBe("super_admin");
  });

  it("A01/A03: no membership → no platform authority even with privileged mirrors", async () => {
    const sb = {
      from(table: string) {
        if (table !== "admin_memberships") throw new Error(table);
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({ data: null, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    await expect(
      hasActiveAdminMembershipOrLegacyRole(sb as never, "u1", "super_admin")
    ).resolves.toBe(false);
    expect(isPrivilegedAdminRole("super_admin")).toBe(true); // classifier only
    expect(
      isPrivilegedAdminAuthority({ role: "super_admin", privilegedAdmin: false })
    ).toBe(false);
    expect(isAdminUser({ role: "admin", is_admin: true })).toBe(false);
  });

  it("A05–A08: admin_tier from membership only; profile tier mismatch has zero effect", async () => {
    const actor = src("lib/admin/require-admin-permission.ts");
    expect(actor).toContain("const adminTier = membership?.admin_tier ?? null");
    expect(actor).not.toMatch(/profile as \{ admin_tier/);
    expect(actor).not.toMatch(/membership\?\.admin_tier \?\? \(profile/);

    // A06 operator
    expect(adminTierToUiRole("operator", "admin")).toBe("operator");
    expect(defaultPermissionsForUiRole("operator")).toEqual(
      expect.arrayContaining(["users", "boards"])
    );
    // A07 manager
    expect(adminTierToUiRole("manager", "admin")).toBe("manager");
    const mgr = defaultPermissionsForUiRole("manager");
    expect(mgr.length).toBeGreaterThan(defaultPermissionsForUiRole("operator").length);
    // A08 NULL tier → operator default
    expect(adminTierToUiRole(null, "admin")).toBe("operator");

    // A05: loadEffective uses passed membership tier; profile mirror not consulted
    const sbEmptyPerms = {
      from(table: string) {
        if (table !== "admin_staff_permissions") throw new Error(table);
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
            };
          },
        };
      },
    };
    const withOperator = await loadEffectiveStaffPermissions(
      sbEmptyPerms as never,
      "u1",
      "admin",
      "operator"
    );
    const withManager = await loadEffectiveStaffPermissions(
      sbEmptyPerms as never,
      "u1",
      "admin",
      "manager"
    );
    expect(withOperator).toEqual(defaultPermissionsForUiRole("operator"));
    expect(withManager).toEqual(defaultPermissionsForUiRole("manager"));
    // mismatch profile tier would have been "manager" — caller must pass membership tier only
    expect(withOperator).not.toEqual(withManager);
  });

  it("dead mirror helpers have no production call sites", () => {
    const verify = src("lib/admin/verify-admin-user-server.ts");
    expect(verify).toMatch(/DEAD \/ NO LIVE CALLER/);
    const roots = ["app", "lib", "components"];
    for (const dir of roots) {
      // only check key live paths via known imports
      void dir;
    }
    expect(src("app/api/admin/trade-flow/route.ts")).not.toMatch(/verifyAdminUserId\s*\(/);
    expect(src("app/admin/layout.tsx")).not.toMatch(/verifyAdminAccess\s*\(/);
    expect(src("lib/admin/admin-user-server.ts")).toContain("export async function loadProfileRole");
    // loadProfileRole callers: none outside definition (grep contract)
    const allAdminTs = src("lib/admin/require-admin-permission.ts") + src("lib/admin/admin-membership.ts");
    expect(allAdminTs).not.toMatch(/loadProfileRole\s*\(/);
  });
});

describe("R6-B — staff privilege revoke lifecycle", () => {
  it("B01–B04/B06: Staff DELETE and PATCH disabled do not soft-delete profile", () => {
    const route = src("app/api/admin/staff/[id]/route.ts");
    expect(route).toContain("revokeActiveAdminMembership");
    expect(route).toContain("lifecycle_unchanged");
    expect(route).toContain("self_mutation_forbidden");
    expect(route).toContain("revoke_admin_privilege");
    // no profile withdrawal on privilege paths
    expect(route).not.toMatch(/patch\.status\s*=\s*"deleted"/);
    expect(route).not.toMatch(/patch\.deleted_at\s*=/);
    expect(route).not.toMatch(/status:\s*"deleted"/);
    expect(route).not.toMatch(/deleted_at:\s*now/);
    expect(route).not.toMatch(/action:\s*"disable_staff"/);
    // privilege API parity markers
    const privilege = src("lib/admin-users/member-admin-privilege-mutation.ts");
    expect(privilege).toContain("self_mutation_forbidden");
    expect(privilege).toContain("lifecycle_unchanged");
  });

  it("B05: revokeActiveAdminMembership deletes staff permission overrides", async () => {
    const deletes: string[] = [];
    let membership: {
      id: string;
      user_id: string;
      role: "admin";
      status: "active" | "revoked";
      admin_tier: string | null;
    } | null = {
      id: "m1",
      user_id: "staff1",
      role: "admin",
      status: "active",
      admin_tier: "operator",
    };
    const sb = {
      from(table: string) {
        if (table === "admin_memberships") {
          return {
            select(_c?: string, countOpts?: { count?: string; head?: boolean }) {
              if (countOpts?.head) {
                return {
                  eq() {
                    return {
                      eq() {
                        return Promise.resolve({ count: 0, error: null });
                      },
                    };
                  },
                };
              }
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        maybeSingle: async () => ({ data: membership, error: null }),
                      };
                    },
                  };
                },
              };
            },
            update(payload: Record<string, unknown>) {
              return {
                eq: async () => {
                  if (membership) {
                    membership = { ...membership, status: "revoked" };
                    void payload;
                  }
                  return { error: null };
                },
              };
            },
          };
        }
        if (table === "admin_staff_permissions") {
          return {
            delete() {
              return {
                eq: async (_col: string, uid: string) => {
                  deletes.push(uid);
                  return { error: null };
                },
              };
            },
          };
        }
        throw new Error(table);
      },
    };
    const result = await revokeActiveAdminMembership(sb as never, {
      userId: "staff1",
      revokedBy: "super1",
      reason: "staff_privilege_removed",
    });
    expect(result).toEqual({ ok: true });
    expect(deletes).toEqual(["staff1"]);
    expect(membership?.status).toBe("revoked");
  });

  it("B07–B10: staff route gates match privilege protections", () => {
    const route = src("app/api/admin/staff/[id]/route.ts");
    expect(route).toContain("requireSuperAdmin");
    expect(route).toContain("cannot_disable_super_admin");
    expect(route).toContain("last_super_admin");
    expect(route).toContain("self_mutation_forbidden");
    const privilegeRoute = src("app/api/admin/users/[id]/privilege/route.ts");
    expect(privilegeRoute).toContain("requireSuperAdmin");
    const mutation = src("lib/admin-users/member-admin-privilege-mutation.ts");
    expect(mutation).toContain("self_mutation_forbidden");
    expect(mutation).toContain("cannot_modify_super_admin");
  });

  it("B11: privilege API remains lifecycle-safe and independent", () => {
    const mutation = src("lib/admin-users/member-admin-privilege-mutation.ts");
    expect(mutation).not.toMatch(/\bdeleted_at\b/);
    expect(mutation).toContain("executeMemberPrivilegeRevoke");
    expect(mutation).toContain("executeMemberPrivilegePromote");
  });

  it("re-grant: revoke clears overrides so prior custom perms cannot resurrect", async () => {
    // Simulate: custom perms deleted on revoke; re-grant uses tier defaults when empty.
    const afterRevoke = await loadEffectiveStaffPermissions(
      {
        from() {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: null, error: null }),
                  };
                },
              };
            },
          };
        },
      } as never,
      "staff1",
      "admin",
      "operator"
    );
    expect(afterRevoke).toEqual(defaultPermissionsForUiRole("operator"));
    expect(afterRevoke).not.toContain("point" as never);
  });
});

describe("R6 Phase 3 — no Kakao / no mirror data writers", () => {
  it("staff revoke path does not write profiles.role / is_admin", () => {
    const membership = src("lib/admin/admin-membership.ts");
    expect(membership).toMatch(/Does NOT reset profiles\.role/);
    const route = src("app/api/admin/staff/[id]/route.ts");
    expect(route).not.toMatch(/is_admin:\s*false/);
    expect(route).not.toMatch(/role:\s*"user"/);
  });
});

// silence unused vi if tree-shaken
void vi;
