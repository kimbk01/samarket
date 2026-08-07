import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasActiveAdminMembershipOrLegacyRole,
  resolveEffectiveAdminRole,
} from "@/lib/admin/admin-membership";
import { applyUsersPatchPrivilegeChange } from "@/lib/admin/users-patch-privilege";

type MembershipState = {
  id: string;
  user_id: string;
  role: "admin" | "super_admin";
  status: "active" | "revoked";
  admin_tier: string | null;
} | null;

type ProfileState = {
  role: string | null;
  is_admin?: boolean;
  member_type?: string | null;
  admin_tier?: string | null;
};

function createStatefulSb(opts: {
  profile: ProfileState;
  membership: MembershipState;
  superAdminCount?: number;
}) {
  let profile = { ...opts.profile };
  let membership = opts.membership ? { ...opts.membership } : null;
  const permissionsDeleted: string[] = [];
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
                        count: opts.superAdminCount ?? (membership?.status === "active" && membership.role === "super_admin" ? 1 : 0),
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
                    eq(col2: string, status: string) {
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
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { role: profile.role }, error: null };
                  },
                };
              },
            };
          },
          update(row: Record<string, unknown>) {
            profileUpdates.push(row);
            profile = {
              role: (row.role as string | null | undefined) ?? profile.role,
              is_admin: (row.is_admin as boolean | undefined) ?? profile.is_admin,
              member_type: (row.member_type as string | null | undefined) ?? profile.member_type,
              admin_tier: (row.admin_tier as string | null | undefined) ?? profile.admin_tier,
            };
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
              eq(_c: string, userId: string) {
                permissionsDeleted.push(userId);
                return Promise.resolve({ error: null });
              },
            };
          },
          upsert() {
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _state: () => ({ profile, membership, profileUpdates, membershipInserts, membershipUpdates, permissionsDeleted }),
  };

  return sb as typeof sb & { _state: () => ReturnType<(typeof sb)["_state"]> };
}

vi.mock("@/lib/admin/admin-user-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/admin-user-server")>(
    "@/lib/admin/admin-user-server"
  );
  return {
    ...actual,
    replaceStaffPermissions: vi.fn(async () => undefined),
    defaultPermissionsForUiRole: actual.defaultPermissionsForUiRole,
  };
});

describe("users PATCH privilege writer alignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A. member → admin: membership + profile mirror + effective YES", async () => {
    const sb = createStatefulSb({
      profile: { role: "user", is_admin: false },
      membership: null,
    });
    const result = await applyUsersPatchPrivilegeChange(sb as never, {
      userId: "u1",
      actorUserId: "actor",
      actorIsMaster: true,
      requestedMemberType: "admin",
      currentProfileRole: "user",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.privilegeHandled).toBe(true);
    const st = sb._state();
    expect(st.membership?.status).toBe("active");
    expect(st.membership?.role).toBe("admin");
    expect(st.profile.role).toBe("admin");
    expect(st.profile.is_admin).toBe(true);
    expect(await hasActiveAdminMembershipOrLegacyRole(sb as never, "u1", st.profile.role)).toBe(
      true
    );
  });

  it("B. member → super_admin: membership super_admin + mirror", async () => {
    const sb = createStatefulSb({
      profile: { role: "user" },
      membership: null,
      superAdminCount: 1,
    });
    const result = await applyUsersPatchPrivilegeChange(sb as never, {
      userId: "u1",
      actorUserId: "actor",
      actorIsMaster: true,
      requestedMemberType: "super_admin",
      currentProfileRole: "user",
    });
    expect(result.ok).toBe(true);
    const st = sb._state();
    expect(st.membership?.role).toBe("super_admin");
    expect(st.profile.role).toBe("super_admin");
    expect(await resolveEffectiveAdminRole(sb as never, "u1", st.profile.role)).toBe("super_admin");
  });

  it("C. admin → member: revoke membership + mirror user", async () => {
    const sb = createStatefulSb({
      profile: { role: "admin", is_admin: true },
      membership: {
        id: "m1",
        user_id: "u1",
        role: "admin",
        status: "active",
        admin_tier: "operator",
      },
    });
    const result = await applyUsersPatchPrivilegeChange(sb as never, {
      userId: "u1",
      actorUserId: "actor",
      actorIsMaster: true,
      requestedMemberType: "normal",
      currentProfileRole: "admin",
    });
    expect(result.ok).toBe(true);
    const st = sb._state();
    expect(st.membership?.status).toBe("revoked");
    expect(st.profile.role).toBe("user");
    expect(st.profile.is_admin).toBe(false);
    expect(await hasActiveAdminMembershipOrLegacyRole(sb as never, "u1", st.profile.role)).toBe(
      false
    );
  });

  it("D. last/any super_admin → member: DENY cannot_disable_super_admin", async () => {
    const sb = createStatefulSb({
      profile: { role: "super_admin", is_admin: true },
      membership: {
        id: "m1",
        user_id: "u1",
        role: "super_admin",
        status: "active",
        admin_tier: null,
      },
      superAdminCount: 1,
    });
    const result = await applyUsersPatchPrivilegeChange(sb as never, {
      userId: "u1",
      actorUserId: "actor",
      actorIsMaster: true,
      requestedMemberType: "normal",
      currentProfileRole: "super_admin",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("cannot_disable_super_admin");
    expect(sb._state().membership?.status).toBe("active");
    expect(sb._state().profile.role).toBe("super_admin");
  });

  it("E. normal member non-privilege PATCH: membership untouched", async () => {
    const sb = createStatefulSb({
      profile: { role: "user", is_admin: false },
      membership: null,
    });
    const result = await applyUsersPatchPrivilegeChange(sb as never, {
      userId: "u1",
      actorUserId: "actor",
      actorIsMaster: true,
      requestedMemberType: "premium",
      currentProfileRole: "user",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.privilegeHandled).toBe(false);
    expect(result.memberTypePatch?.member_type).toBe("premium");
    expect(result.memberTypePatch?.role).toBe("user");
    expect(sb._state().membership).toBeNull();
    expect(sb._state().membershipInserts).toHaveLength(0);
  });

  it("F. store-owner non-admin PATCH: no admin membership", async () => {
    const sb = createStatefulSb({
      profile: { role: "user" },
      membership: null,
    });
    const result = await applyUsersPatchPrivilegeChange(sb as never, {
      userId: "owner1",
      actorUserId: "actor",
      actorIsMaster: true,
      requestedMemberType: "normal",
      currentProfileRole: "user",
    });
    expect(result.ok).toBe(true);
    expect(sb._state().membershipInserts).toHaveLength(0);
    expect(sb._state().membership).toBeNull();
  });

  it("G. invalid privilege promotion without master: no write", async () => {
    const sb = createStatefulSb({
      profile: { role: "user" },
      membership: null,
    });
    const result = await applyUsersPatchPrivilegeChange(sb as never, {
      userId: "u1",
      actorUserId: "actor",
      actorIsMaster: false,
      requestedMemberType: "admin",
      currentProfileRole: "user",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("forbidden_promote_admin");
    expect(sb._state().membershipInserts).toHaveLength(0);
    expect(sb._state().profileUpdates).toHaveLength(0);
  });

  it("route wires applyUsersPatchPrivilegeChange; no role-only admin bypass", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/admin/users/[id]/route.ts"),
      "utf8"
    );
    expect(route).toMatch(/applyUsersPatchPrivilegeChange/);
    expect(route).not.toMatch(/use_staff_api_for_admin_promotion/);
    expect(route).not.toMatch(/memberTypeToProfileAndTestRole/);
    const helper = readFileSync(
      join(process.cwd(), "lib/admin/users-patch-privilege.ts"),
      "utf8"
    );
    expect(helper).toMatch(/upsertActiveAdminMembership/);
    expect(helper).toMatch(/revokeActiveAdminMembership/);
  });

  it("Staff/PATCH grant+revoke helpers are the same membership writers", () => {
    const staff = readFileSync(join(process.cwd(), "app/api/admin/staff/route.ts"), "utf8");
    const staffId = readFileSync(join(process.cwd(), "app/api/admin/staff/[id]/route.ts"), "utf8");
    const helper = readFileSync(
      join(process.cwd(), "lib/admin/users-patch-privilege.ts"),
      "utf8"
    );
    expect(staff).toMatch(/upsertActiveAdminMembership/);
    expect(staffId).toMatch(/revokeActiveAdminMembership/);
    expect(helper).toMatch(/upsertActiveAdminMembership/);
    expect(helper).toMatch(/revokeActiveAdminMembership/);
  });
});
