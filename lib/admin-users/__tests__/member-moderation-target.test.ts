import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertMemberModerationTargetAllowed } from "@/lib/admin-users/member-moderation-target";

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

describe("assertMemberModerationTargetAllowed", () => {
  it("blocks Super Admin targets regardless of actor", async () => {
    const result = await assertMemberModerationTargetAllowed(membershipSb("super_admin") as never, {
      targetUserId: "target",
      actorIsSuperAdmin: true,
    });
    expect(result).toEqual({
      ok: false,
      error: "forbidden_super_admin_target",
      status: 403,
    });
  });

  it("blocks admin targets for non-super actors", async () => {
    const result = await assertMemberModerationTargetAllowed(membershipSb("admin") as never, {
      targetUserId: "target",
      actorIsSuperAdmin: false,
    });
    expect(result).toEqual({
      ok: false,
      error: "forbidden_admin_target",
      status: 403,
    });
  });

  it("allows admin targets for Super Admin actors", async () => {
    const result = await assertMemberModerationTargetAllowed(membershipSb("admin") as never, {
      targetUserId: "target",
      actorIsSuperAdmin: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it("allows members with no membership", async () => {
    const result = await assertMemberModerationTargetAllowed(membershipSb(null) as never, {
      targetUserId: "target",
      actorIsSuperAdmin: false,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("moderation route membership guard contract", () => {
  it("POST uses membership helper and does not read profiles.role for SA protection", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/admin/users/[id]/moderation/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/assertMemberModerationTargetAllowed/);
    expect(src).not.toMatch(/normalizeAdminRole\(\(targetProfile/);
    expect(src).not.toMatch(/targetRole === "super_admin"/);
  });
});
