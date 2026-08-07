import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { clientProfilePassesPhoneVerification } from "@/lib/auth/assert-phone-verified-for-messenger-action-client";
import { isAdminUser } from "@/lib/auth/admin-policy";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import type { ProfileRow } from "@/lib/profile/types";
import { DEFAULT_PROFILE_ROW } from "@/lib/profile/types";

function row(partial: Partial<ProfileRow>): ProfileRow {
  return { ...DEFAULT_PROFILE_ROW, id: "u1", email: "u@example.com", ...partial };
}

describe("client canonical admin snapshot", () => {
  it("profileRowToClientProfile maps privilegedAdmin (not is_admin mirror)", () => {
    const membershipOnly = profileRowToClientProfile(
      row({ role: "user", is_admin: false, privilegedAdmin: true })
    );
    expect(membershipOnly.privilegedAdmin).toBe(true);
    expect(membershipOnly.role).toBe("user");
    expect(membershipOnly.is_admin).toBe(false);
    expect(isAdminUser(membershipOnly)).toBe(true);

    const legacyOnly = profileRowToClientProfile(
      row({ role: "admin", is_admin: true, privilegedAdmin: false })
    );
    expect(legacyOnly.privilegedAdmin).toBe(false);
    expect(isAdminUser(legacyOnly)).toBe(false);
  });

  it("messenger phone gate: membership-only admin exempt; legacy-role-only denied", () => {
    expect(
      clientProfilePassesPhoneVerification({
        id: "u1",
        email: "u@example.com",
        nickname: "u",
        avatar_url: null,
        temperature: 50,
        role: "user",
        is_admin: false,
        privilegedAdmin: true,
        phone_verified: false,
      })
    ).toBe(true);

    expect(
      clientProfilePassesPhoneVerification({
        id: "u1",
        email: "u@example.com",
        nickname: "u",
        avatar_url: null,
        temperature: 50,
        role: "admin",
        is_admin: true,
        privilegedAdmin: false,
        phone_verified: false,
      })
    ).toBe(false);

    expect(
      clientProfilePassesPhoneVerification({
        id: "u1",
        email: "u@example.com",
        nickname: "u",
        avatar_url: null,
        temperature: 50,
        role: "admin",
        is_admin: true,
        // missing privilegedAdmin → no admin exemption
        phone_verified: false,
      })
    ).toBe(false);
  });

  it("hasVerifiedPhone ignores is_admin mirror without privilegedAdmin", () => {
    expect(
      hasVerifiedPhone({
        role: "admin",
        is_admin: true,
        phone_verified: false,
      })
    ).toBe(false);
    expect(
      hasVerifiedPhone({
        role: "user",
        is_admin: false,
        privilegedAdmin: true,
        phone_verified: false,
      })
    ).toBe(true);
  });

  it("matrix: snapshot field independence from legacy mirror", () => {
    const cases = [
      { name: "membership-only admin", privilegedAdmin: true, role: "user", is_admin: false, expect: true },
      { name: "membership-only super_admin", privilegedAdmin: true, role: "user", is_admin: false, expect: true },
      { name: "legacy-role-only admin", privilegedAdmin: false, role: "admin", is_admin: true, expect: false },
      { name: "inactive + privileged profile", privilegedAdmin: false, role: "super_admin", is_admin: true, expect: false },
      { name: "store owner", privilegedAdmin: false, role: "user", is_admin: false, expect: false },
      { name: "member", privilegedAdmin: false, role: "user", is_admin: false, expect: false },
    ] as const;

    for (const c of cases) {
      const client = profileRowToClientProfile(
        row({ role: c.role, is_admin: c.is_admin, privilegedAdmin: c.privilegedAdmin })
      );
      expect(client.privilegedAdmin).toBe(c.privilegedAdmin);
      expect(isAdminUser(client)).toBe(c.expect);
      expect(
        clientProfilePassesPhoneVerification({
          ...client,
          phone_verified: false,
        })
      ).toBe(c.expect);
    }
  });

  it("source: me-profile pipeline attaches membership privilegedAdmin", () => {
    const src = readFileSync(join(process.cwd(), "lib/profile/me-profile-read-pipeline.ts"), "utf8");
    expect(src).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(src).toMatch(/privilegedAdmin/);
  });

  it("source: client mapper and messenger gate use privilegedAdmin", () => {
    const mapper = readFileSync(join(process.cwd(), "lib/auth/profile-row-to-client-profile.ts"), "utf8");
    const gate = readFileSync(
      join(process.cwd(), "lib/auth/assert-phone-verified-for-messenger-action-client.ts"),
      "utf8"
    );
    expect(mapper).toMatch(/privilegedAdmin:\s*row\.privilegedAdmin === true/);
    expect(gate).toMatch(/user\.privilegedAdmin === true/);
    expect(gate).not.toMatch(/is_admin\s*===\s*true/);
    expect(gate).not.toMatch(/from\("admin_memberships"\)/);
    expect(gate).not.toMatch(/NEXT_PUBLIC_ADMIN_ROLE/);
  });
});
