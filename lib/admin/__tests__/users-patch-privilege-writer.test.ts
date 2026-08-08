import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyUsersPatchPrivilegeChange,
  parseUsersPatchMemberType,
} from "@/lib/admin/users-patch-privilege";

function createMembershipReader(role: "admin" | "super_admin" | null) {
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
                      return role
                        ? {
                            data: {
                              id: "m1",
                              user_id: "u1",
                              role,
                              status: "active",
                              admin_tier: role === "admin" ? "operator" : null,
                            },
                            error: null,
                          }
                        : { data: null, error: null };
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

describe("Users PATCH member-only authority boundary", () => {
  it("rejects every Admin authority token", () => {
    for (const value of ["admin", "super_admin", "master", "ADMIN"]) {
      expect(parseUsersPatchMemberType(value)).toEqual({ error: "invalid_member_type" });
    }
  });

  it("allows only normal and premium member classification", () => {
    expect(parseUsersPatchMemberType("normal")).toBe("normal");
    expect(parseUsersPatchMemberType("premium")).toBe("premium");
  });

  it.each(["admin", "super_admin"] as const)(
    "refuses member classification writes for active %s targets",
    async (role) => {
      const result = await applyUsersPatchPrivilegeChange(
        createMembershipReader(role) as never,
        { userId: "u1", requestedMemberType: "normal" }
      );
      expect(result).toMatchObject({
        ok: false,
        error: "use_staff_api_for_admin_authority",
        status: 409,
      });
    }
  );

  it("returns a non-privileged profile patch for a normal member", async () => {
    const result = await applyUsersPatchPrivilegeChange(
      createMembershipReader(null) as never,
      { userId: "u1", requestedMemberType: "premium" }
    );
    expect(result).toEqual({
      ok: true,
      privilegeHandled: false,
      memberTypePatch: {
        member_type: "premium",
        is_special_member: true,
      },
    });
  });

  it("source contains no Admin membership writer in Users PATCH", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/route.ts"), "utf8");
    const helper = readFileSync(
      join(process.cwd(), "lib/admin/users-patch-privilege.ts"),
      "utf8"
    );
    expect(route).toMatch(/use the dedicated Staff API/);
    expect(helper).not.toMatch(/upsertActiveAdminMembership/);
    expect(helper).not.toMatch(/revokeActiveAdminMembership/);
    expect(helper).not.toMatch(/replaceStaffPermissions/);
  });
});
