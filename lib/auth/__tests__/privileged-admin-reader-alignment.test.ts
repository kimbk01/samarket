import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { isPrivilegedAdminAuthority } from "@/lib/auth/admin-policy";
import { deriveDibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { canUseVerifiedMemberFeatures, type MemberAccessState } from "@/lib/auth/member-access";
import { clientProfilePassesPhoneVerification } from "@/lib/auth/assert-phone-verified-for-messenger-action-client";
import {
  deriveStoreMemberStatus,
  hasPhilippinePhoneVerification,
} from "@/lib/auth/store-member-policy";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";

type Persona = {
  name: string;
  profileRole: string | null;
  membership: { role: "admin" | "super_admin"; status: "active" | "revoked" } | null;
  expectExempt: boolean;
};

const PERSONAS: Persona[] = [
  {
    name: "legacy super_admin",
    profileRole: "super_admin",
    membership: null,
    expectExempt: false,
  },
  {
    name: "legacy-role-only admin",
    profileRole: "admin",
    membership: null,
    expectExempt: false,
  },
  {
    name: "membership-only admin",
    profileRole: "user",
    membership: { role: "admin", status: "active" },
    expectExempt: true,
  },
  {
    name: "membership-only super_admin",
    profileRole: "user",
    membership: { role: "super_admin", status: "active" },
    expectExempt: true,
  },
  {
    name: "revoked membership",
    profileRole: "user",
    membership: { role: "admin", status: "revoked" },
    expectExempt: false,
  },
  {
    name: "store owner only",
    profileRole: "user",
    membership: null,
    expectExempt: false,
  },
  {
    name: "normal member",
    profileRole: "user",
    membership: null,
    expectExempt: false,
  },
];

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
              eq(_col: string, _val: string) {
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
                              granted_at: "2026-01-01",
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

function memberState(opts: {
  role: string;
  privilegedAdmin: boolean;
  phoneVerified?: boolean;
}): MemberAccessState {
  return {
    userId: "u1",
    email: "u@example.com",
    username: "u1",
    nickname: "u1",
    avatarUrl: null,
    role: opts.role,
    memberType: opts.privilegedAdmin ? "admin" : "normal",
    status: "active",
    phone: null,
    phoneVerified: opts.phoneVerified === true,
    phoneVerificationStatus: opts.phoneVerified ? "verified" : "unverified",
    authProvider: "google",
    isAdmin: opts.privilegedAdmin,
    storeMemberStatus: opts.privilegedAdmin
      ? "admin"
      : opts.phoneVerified
        ? "verified_member"
        : "sns_member",
  };
}

describe("privileged admin reader alignment — shared CURRENT dual-read matrix", () => {
  for (const c of PERSONAS) {
    it(`${c.name}: shared authority → product gates`, async () => {
      const sb = mockSb({ profileRole: c.profileRole, membership: c.membership });
      const privilegedAdmin = await hasActiveAdminMembershipOrLegacyRole(
        sb,
        "u1",
        c.profileRole
      );
      expect(privilegedAdmin).toBe(c.expectExempt);
      expect(
        isPrivilegedAdminAuthority({ role: c.profileRole, privilegedAdmin })
      ).toBe(c.expectExempt);

      // phone / store-member sync gates
      expect(
        hasPhilippinePhoneVerification({
          role: c.profileRole,
          privilegedAdmin,
          phone_verified: false,
          phone_verified_at: null,
          provider: "google",
          email: "u@example.com",
        })
      ).toBe(c.expectExempt);

      expect(
        hasVerifiedPhone({
          role: c.profileRole,
          privilegedAdmin,
          phone_verified: false,
        })
      ).toBe(c.expectExempt);

      // signup admin bypass
      const signup = deriveDibaySignupStatus(
        { id: "u1", role: c.profileRole },
        { hasSession: true, privilegedAdmin }
      );
      expect(signup.signupComplete).toBe(c.expectExempt);

      // member-access
      expect(
        canUseVerifiedMemberFeatures(
          memberState({ role: c.profileRole ?? "user", privilegedAdmin })
        )
      ).toBe(c.expectExempt);

      // store label
      expect(
        deriveStoreMemberStatus({
          role: c.profileRole,
          privilegedAdmin,
          phone_verified: false,
        })
      ).toBe(c.expectExempt ? "admin" : "sns_member");

      // messenger client: no role/is_admin admin exemption (server enforces membership)
      expect(
        clientProfilePassesPhoneVerification({
          id: "u1",
          email: "u@example.com",
          nickname: "u",
          avatar_url: null,
          temperature: 50,
          role: c.profileRole ?? undefined,
          phone_verified: false,
          is_admin: privilegedAdmin ? true : false,
        })
      ).toBe(false);

      // store orderability — owner blocked unless privileged admin
      const orderability = await resolveStoreOrderability(sb, "u1", "u1");
      expect(orderability.viewer_is_owner).toBe(true);
      expect(orderability.viewer_is_admin).toBe(c.expectExempt);
      expect(orderability.can_order_store).toBe(c.expectExempt);
    });
  }

  it("general user: phone verified member still allowed without admin", () => {
    expect(
      hasPhilippinePhoneVerification({
        role: "user",
        privilegedAdmin: false,
        phone_verified: true,
        phone_verified_at: "2026-01-01T00:00:00.000Z",
        provider: "google",
      })
    ).toBe(true);
    expect(
      canUseVerifiedMemberFeatures(
        memberState({ role: "user", privilegedAdmin: false, phoneVerified: true })
      )
    ).toBe(true);
  });

  it("general user: unverified non-admin still blocked", () => {
    expect(
      hasPhilippinePhoneVerification({
        role: "user",
        privilegedAdmin: false,
        phone_verified: false,
        provider: "google",
      })
    ).toBe(false);
    expect(
      canUseVerifiedMemberFeatures(
        memberState({ role: "user", privilegedAdmin: false, phoneVerified: false })
      )
    ).toBe(false);
  });
});

describe("verifyAdminUserId — DEAD / NO LIVE CALLER", () => {
  it("trade-flow routes import getServiceOrAnonClient only; verifier remains unused", () => {
    const root = process.cwd();
    const paths = [
      "app/api/admin/trade-flow/confirm-buyer/route.ts",
      "app/api/admin/trade-flow/revert/route.ts",
      "app/api/admin/trade-completion/route.ts",
      "app/api/admin/ops-trade-policy/route.ts",
    ];
    for (const rel of paths) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).toMatch(/getServiceOrAnonClient/);
      expect(src).not.toMatch(/\bverifyAdminUserId\s*\(/);
      expect(src).not.toMatch(/\bverifyAdminAccess\s*\(/);
    }
    const verifySrc = readFileSync(
      join(root, "lib/admin/verify-admin-user-server.ts"),
      "utf8"
    );
    expect(verifySrc).toMatch(/DEAD \/ NO LIVE CALLER/);
  });
});

describe("aligned readers source contract", () => {
  it("server readers use hasActiveAdminMembershipOrLegacyRole", () => {
    const files = [
      "lib/auth/get-onboarding-status.ts",
      "lib/auth/member-access.ts",
      "lib/auth/server-guards.ts",
      "lib/stores/store-orderability-policy.ts",
      "lib/my/load-mypage-server.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    }
  });

  it("messenger client does not query membership tables and does not trust is_admin", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/assert-phone-verified-for-messenger-action-client.ts"),
      "utf8"
    );
    expect(src).toMatch(/privilegedAdmin:\s*false/);
    expect(src).not.toMatch(/is_admin\s*===\s*true/);
    expect(src).not.toMatch(/from\("admin_memberships"\)/);
    expect(src).not.toMatch(/process\.env\.NEXT_PUBLIC_ADMIN_ROLE/);
  });
});
