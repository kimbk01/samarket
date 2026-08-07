import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveEffectiveAdminRole } from "@/lib/admin/admin-membership";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

type Case = {
  name: string;
  profileRole: string | null;
  membership: { role: "admin" | "super_admin"; status: "active" | "revoked" | "suspended" } | null;
  expectAllow: boolean;
};

function mockSb(opts: {
  profileRole: string | null;
  membership: { role: string; status: string } | null;
}) {
  return {
    from(table: string) {
      if (table === "admin_memberships") {
        return {
          select() {
            return {
              eq(_col: string, val: string) {
                if (_col === "user_id") {
                  return {
                    eq(_c2: string, status: string) {
                      return {
                        async maybeSingle() {
                          const m = opts.membership;
                          if (!m || m.status !== status) {
                            return { data: null, error: null };
                          }
                          return {
                            data: {
                              id: "m1",
                              user_id: "u1",
                              role: m.role,
                              status: m.status,
                              admin_tier: null,
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
                }
                return this;
              },
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { role: opts.profileRole }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

const MATRIX: Case[] = [
  {
    name: "A membership-only admin",
    profileRole: "user",
    membership: { role: "admin", status: "active" },
    expectAllow: true,
  },
  {
    name: "B membership-only super_admin",
    profileRole: "user",
    membership: { role: "super_admin", status: "active" },
    expectAllow: true,
  },
  {
    name: "C legacy-role-only admin",
    profileRole: "admin",
    membership: null,
    expectAllow: false,
  },
  {
    name: "D legacy-role-only super_admin",
    profileRole: "super_admin",
    membership: null,
    expectAllow: false,
  },
  {
    name: "E inactive membership + privileged profile",
    profileRole: "admin",
    membership: { role: "admin", status: "suspended" },
    expectAllow: false,
  },
  {
    name: "F store owner only",
    profileRole: "user",
    membership: null,
    expectAllow: false,
  },
  {
    name: "G normal member",
    profileRole: "user",
    membership: null,
    expectAllow: false,
  },
];

describe("APPLICATION ADMIN AUTHORITY — membership-only matrix", () => {
  it.each(MATRIX)("$name → allow=$expectAllow (App/DB skew=0)", async (c) => {
    const sb = mockSb({ profileRole: c.profileRole, membership: c.membership });
    const effective = await resolveEffectiveAdminRole(sb, "u1", c.profileRole);
    const allow = isPrivilegedAdminRole(effective);
    expect(allow).toBe(c.expectAllow);

    const effectiveDb = await resolveEffectiveAdminRole(sb, "u1");
    expect(isPrivilegedAdminRole(effectiveDb)).toBe(c.expectAllow);
  });

  it("source: resolveEffectiveAdminRole has no profiles.role fallback", () => {
    const src = readFileSync(join(process.cwd(), "lib/admin/admin-membership.ts"), "utf8");
    const start = src.indexOf("export async function resolveEffectiveAdminRole");
    const end = src.indexOf("export async function hasActiveAdminMembershipOrLegacyRole");
    const body = src.slice(start, end);
    expect(body).toMatch(/loadActiveAdminMembership/);
    expect(body).not.toMatch(/from\("profiles"\)/);
    expect(body).not.toMatch(/isPrivilegedAdminRole\(profileRole\)/);
  });

  it("source: requireAdmin / isRouteAdmin / requireAdminApiActor membership-only", () => {
    const guards = readFileSync(join(process.cwd(), "lib/auth/server-guards.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "lib/auth/is-route-admin.ts"), "utf8");
    const actor = readFileSync(join(process.cwd(), "lib/admin/require-admin-permission.ts"), "utf8");
    const requireAdmin = guards.slice(
      guards.indexOf("export async function requireAdmin"),
      guards.indexOf("export async function requireAdmin") + 900
    );
    expect(requireAdmin).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(requireAdmin).not.toMatch(/isPrivilegedAdminRole\(profile\.role\)/);
    expect(route).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(route).not.toMatch(/isPrivilegedAdminRole/);
    expect(actor).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(actor).not.toMatch(/isPrivilegedAdminRole\(profile\.role\)/);
  });

  it("source: staff GET is membership-only (no privileged role union)", () => {
    const staff = readFileSync(join(process.cwd(), "app/api/admin/staff/route.ts"), "utf8");
    const getStart = staff.indexOf("export async function GET");
    const getBody = staff.slice(getStart, staff.indexOf("export async function POST"));
    expect(getBody).toMatch(/admin_memberships/);
    expect(getBody).not.toMatch(/\.in\("role",\s*\["admin", "super_admin", "master"\]\)/);
  });
});
