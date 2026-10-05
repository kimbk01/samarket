import { describe, expect, it } from "vitest";
import {
  isManualLoginCredentialAccount,
  resolveContactEmailCredentialPatch,
} from "@/lib/auth/manual-member-login-credential";

describe("manual-member-login-credential", () => {
  it("detects admin_manual and @manual.local accounts", () => {
    expect(
      isManualLoginCredentialAccount({
        authProvider: "admin_manual",
        authEmail: "ops@manual.local",
      }),
    ).toBe(true);
    expect(
      isManualLoginCredentialAccount({
        authLoginEmail: "staff01@manual.local",
      }),
    ).toBe(true);
    expect(
      isManualLoginCredentialAccount({
        authProvider: "email",
        authEmail: "member@example.com",
      }),
    ).toBe(false);
  });

  it("manual contact clear must not wipe auth_login_email or Auth email", () => {
    const plan = resolveContactEmailCredentialPatch({
      nextContactEmail: null,
      profile: {
        provider: "admin_manual",
        auth_provider: "admin_manual",
        username: "ops01",
        email: "ops@company.com",
        auth_login_email: "ops01@manual.local",
      },
      authEmail: "ops01@manual.local",
    });
    expect(plan.profilePatch).toEqual({ email: null });
    expect(plan.authEmailUpdate).toBeUndefined();
  });

  it("manual contact set updates contact only and repairs drifted auth_login_email", () => {
    const plan = resolveContactEmailCredentialPatch({
      nextContactEmail: "ops@company.com",
      profile: {
        provider: "admin_manual",
        auth_provider: "admin_manual",
        username: "ops01",
        email: null,
        auth_login_email: "ops@company.com",
      },
      authEmail: "ops01@manual.local",
    });
    expect(plan.profilePatch).toEqual({
      email: "ops@company.com",
      auth_login_email: "ops01@manual.local",
    });
    expect(plan.authEmailUpdate).toBeUndefined();
  });

  it("non-manual contact set still syncs login email + Auth", () => {
    const plan = resolveContactEmailCredentialPatch({
      nextContactEmail: "new@example.com",
      profile: {
        provider: "email",
        auth_provider: "email",
        username: "user1",
        email: "old@example.com",
        auth_login_email: "old@example.com",
      },
      authEmail: "old@example.com",
    });
    expect(plan.profilePatch).toEqual({
      email: "new@example.com",
      auth_login_email: "new@example.com",
    });
    expect(plan.authEmailUpdate).toBe("new@example.com");
  });

  it("non-manual contact clear keeps auth_login_email", () => {
    const plan = resolveContactEmailCredentialPatch({
      nextContactEmail: null,
      profile: {
        provider: "email",
        auth_provider: "email",
        username: null,
        email: "old@example.com",
        auth_login_email: "old@example.com",
      },
      authEmail: "old@example.com",
    });
    expect(plan.profilePatch).toEqual({ email: null });
    expect(plan.authEmailUpdate).toBeUndefined();
  });
});
