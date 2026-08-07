/**
 * Dual-write cutover: Admin privilege writers must not mirror to profiles.role / is_admin.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasActiveAdminMembershipOrLegacyRole,
  revokeActiveAdminMembership,
  upsertActiveAdminMembership,
} from "@/lib/admin/admin-membership";

type MembershipState = {
  id: string;
  user_id: string;
  role: "admin" | "super_admin";
  status: "active" | "revoked";
  admin_tier: string | null;
  bootstrap_seed?: boolean;
} | null;

function createSb(opts: {
  membership: MembershipState;
  superAdminCount?: number;
}) {
  let membership = opts.membership ? { ...opts.membership } : null;
  const profileUpdates: Record<string, unknown>[] = [];
  const membershipInserts: Record<string, unknown>[] = [];
  const membershipUpdates: Record<string, unknown>[] = [];

  const sb = {
    from(table: string) {
      if (table === "admin_memberships") {
        return {
          select(_cols?: string, countOpts?: { count?: string; head?: boolean }) {
            if (countOpts?.head) {
              return {
                eq() {
                  return {
                    eq() {
                      return Promise.resolve({
                        count:
                          opts.superAdminCount ??
                          (membership?.status === "active" && membership.role === "super_admin"
                            ? 1
                            : 0),
                        error: null,
                      });
                    },
                  };
                },
              };
            }
            return {
              eq(col: string, val: string) {
                if (col === "user_id") {
                  return {
                    eq(_col2: string, status: string) {
                      return {
                        async maybeSingle() {
                          if (
                            membership &&
                            membership.user_id === val &&
                            membership.status === status
                          ) {
                            return { data: { ...membership }, error: null };
                          }
                          return { data: null, error: null };
                        },
                      };
                    },
                  };
                }
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return { data: null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(row: Record<string, unknown>) {
            membershipInserts.push(row);
            membership = {
              id: "m-new",
              user_id: String(row.user_id),
              role: row.role as "admin" | "super_admin",
              status: "active",
              admin_tier: (row.admin_tier as string | null) ?? null,
              bootstrap_seed: Boolean(row.bootstrap_seed),
            };
            return {
              select() {
                return {
                  async maybeSingle() {
                    return { data: { id: "m-new" }, error: null };
                  },
                };
              },
            };
          },
          update(row: Record<string, unknown>) {
            membershipUpdates.push(row);
            return {
              eq(_col: string, id: string) {
                if (membership && membership.id === id) {
                  membership = {
                    ...membership,
                    ...(row.role ? { role: row.role as "admin" | "super_admin" } : {}),
                    ...(row.status ? { status: row.status as "active" | "revoked" } : {}),
                    ...(row.admin_tier !== undefined
                      ? { admin_tier: row.admin_tier as string | null }
                      : {}),
                  };
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          update(row: Record<string, unknown>) {
            profileUpdates.push(row);
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "admin_staff_permissions") {
        return {
          delete() {
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _state: () => ({ membership, profileUpdates, membershipInserts, membershipUpdates }),
  };

  return sb as typeof sb & { _state: () => ReturnType<(typeof sb)["_state"]> };
}

describe("admin privilege dual-write cutover", () => {
  it("upsertActiveAdminMembership writes membership only (no profiles.*)", async () => {
    const sb = createSb({ membership: null });
    const result = await upsertActiveAdminMembership(sb as never, {
      userId: "u1",
      role: "admin",
      adminTier: "operator",
      grantedBy: "actor",
    });
    expect(result.ok).toBe(true);
    const st = sb._state();
    expect(st.membership?.status).toBe("active");
    expect(st.membership?.role).toBe("admin");
    expect(st.profileUpdates).toHaveLength(0);
  });

  it("revokeActiveAdminMembership revokes membership only (no profiles.*)", async () => {
    const sb = createSb({
      membership: {
        id: "m1",
        user_id: "u1",
        role: "admin",
        status: "active",
        admin_tier: "operator",
      },
    });
    const result = await revokeActiveAdminMembership(sb as never, {
      userId: "u1",
      revokedBy: "actor",
      reason: "test",
    });
    expect(result.ok).toBe(true);
    const st = sb._state();
    expect(st.membership?.status).toBe("revoked");
    expect(st.profileUpdates).toHaveLength(0);
    expect(await hasActiveAdminMembershipOrLegacyRole(sb as never, "u1", "admin")).toBe(false);
  });

  it("last super_admin revoke DENY", async () => {
    const sb = createSb({
      membership: {
        id: "m1",
        user_id: "u1",
        role: "super_admin",
        status: "active",
        admin_tier: null,
      },
      superAdminCount: 1,
    });
    const result = await revokeActiveAdminMembership(sb as never, {
      userId: "u1",
      revokedBy: "actor",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("last_super_admin");
    expect(sb._state().profileUpdates).toHaveLength(0);
  });

  it("source: helpers never touch profiles table", () => {
    const src = readFileSync(join(process.cwd(), "lib/admin/admin-membership.ts"), "utf8");
    expect(src).not.toMatch(/from\(["']profiles["']\)/);
  });

  it("source: staff create profile stays non-privileged; membership grants admin", () => {
    const staff = readFileSync(join(process.cwd(), "app/api/admin/staff/route.ts"), "utf8");
    expect(staff).toMatch(/role:\s*"user"/);
    expect(staff).toMatch(/is_admin:\s*false/);
    expect(staff).toMatch(/upsertActiveAdminMembership/);
    expect(staff).not.toMatch(/role:\s*"admin",\s*\n\s*is_admin:\s*true/);
  });

  it("source: staff DELETE soft-delete does not reset privilege mirror columns", () => {
    const staffId = readFileSync(
      join(process.cwd(), "app/api/admin/staff/[id]/route.ts"),
      "utf8"
    );
    expect(staffId).toMatch(/status:\s*"deleted"/);
    expect(staffId).not.toMatch(/role:\s*"user"/);
    expect(staffId).not.toMatch(/is_admin:\s*false/);
    expect(staffId).not.toMatch(/admin_tier:\s*null/);
  });

  it("source: bootstrap authority is membership; no privileged profile ON CONFLICT rewrite", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/scripts/bootstrap-aaaa-master-admin.sql"),
      "utf8"
    );
    expect(sql).toContain("admin_memberships");
    expect(sql).toContain("'super_admin'");
    expect(sql).toMatch(/'user'/);
    expect(sql).toMatch(/false,/);
    // profiles ON CONFLICT must not rewrite privilege columns (test_users may still mirror role)
    const profilesConflict = sql.slice(
      sql.indexOf("INSERT INTO public.profiles"),
      sql.indexOf("IF to_regclass('public.admin_memberships')")
    );
    expect(profilesConflict).not.toMatch(/role = EXCLUDED\.role/);
    expect(profilesConflict).not.toMatch(/is_admin = EXCLUDED\.is_admin/);
    expect(profilesConflict).not.toMatch(/member_type = EXCLUDED\.member_type/);
  });
});
