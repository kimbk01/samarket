import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveEffectiveAdminRole } from "@/lib/admin/admin-membership";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

type Case = {
  name: string;
  profileRole: string | null;
  membership: { role: "admin" | "super_admin"; status: "active" | "revoked" } | null;
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
    name: "A legacy super_admin, no membership → DENY",
    profileRole: "super_admin",
    membership: null,
    expectAllow: false,
  },
  {
    name: "B membership-only admin",
    profileRole: "user",
    membership: { role: "admin", status: "active" },
    expectAllow: true,
  },
  {
    name: "C membership-only super_admin",
    profileRole: "user",
    membership: { role: "super_admin", status: "active" },
    expectAllow: true,
  },
  {
    name: "D revoked membership, non-privileged role",
    profileRole: "user",
    membership: { role: "admin", status: "revoked" },
    expectAllow: false,
  },
  {
    name: "E store-owner-like profile (user role only)",
    profileRole: "user",
    membership: null,
    expectAllow: false,
  },
  {
    name: "F normal member",
    profileRole: "user",
    membership: null,
    expectAllow: false,
  },
];

describe("ADMIN AUTHORITY — Application membership-only (post App fallback cutover)", () => {
  it.each(MATRIX)("$name → allow=$expectAllow (skew=0 across readers)", async (c) => {
    const sb = mockSb({ profileRole: c.profileRole, membership: c.membership });
    const effective = await resolveEffectiveAdminRole(sb, "u1", c.profileRole);
    const allow = isPrivilegedAdminRole(effective);

    expect(allow).toBe(c.expectAllow);

    const effectiveDb = await resolveEffectiveAdminRole(sb, "u1");
    expect(isPrivilegedAdminRole(effectiveDb)).toBe(c.expectAllow);
  });

  it("source: isRouteAdmin / platform-admin-db / staff list share membership helper", () => {
    const route = readFileSync(join(process.cwd(), "lib/auth/is-route-admin.ts"), "utf8");
    const platform = readFileSync(join(process.cwd(), "lib/admin/platform-admin-db.ts"), "utf8");
    const staff = readFileSync(join(process.cwd(), "app/api/admin/staff/route.ts"), "utf8");
    const guards = readFileSync(join(process.cwd(), "lib/auth/server-guards.ts"), "utf8");

    expect(route).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(platform).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(guards).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(staff).toMatch(/admin_memberships/);
    expect(staff).toMatch(/status.*active|eq\("status", "active"\)/);
    expect(route).not.toMatch(/tryGetSupabaseForStores|try-supabase-stores/);
  });

  it("source: bootstrap upserts membership for known Auth UUID — alias/password are not authority", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/scripts/bootstrap-aaaa-master-admin.sql"),
      "utf8"
    );
    expect(sql).toMatch(/admin_memberships/);
    expect(sql).toMatch(/bootstrap_seed/);
    expect(sql).toMatch(/super_admin/);
    expect(sql).toContain("11111111-1111-1111-1111-111111111111");
    expect(sql).toMatch(/auth\.users/);
    expect(sql).not.toMatch(/aaaa@manual\.local/);
    expect(sql).not.toMatch(/test_users/);
    expect(sql).not.toMatch(/password|bcrypt|crypt\s*\(/i);
    expect(sql).not.toMatch(/profiles\.role|UPDATE\s+public\.profiles/i);
    expect(sql).not.toMatch(/username\s*=\s*'aaaa'\s*.*admin|IF\s+.*aaaa.*THEN.*super_admin/i);
  });
});
