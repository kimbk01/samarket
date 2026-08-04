import { describe, expect, it } from "vitest";
import {
  COMMON_AUTH_COMPLETION_OWNERS,
  COMMON_AUTH_COMPLETION_STAGE,
  INTERACTION_READY_POLICY,
} from "@/lib/auth/completion/types";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import { resolveCommonAuthDestination } from "@/lib/auth/completion/resolve-common-auth-destination.server";
import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function termsRequiredStatus(): OnboardingStatus {
  return {
    profileExists: true,
    usernameComplete: false,
    dibayIdComplete: false,
    nicknameComplete: false,
    consentComplete: false,
    addressComplete: false,
    phoneVerified: false,
    profileComplete: false,
    signupComplete: false,
    isPrivilegedAdmin: false,
    dibayId: null,
    dibayIdLocked: false,
    username: null,
    usernameConfirmed: false,
    termsAcceptedAt: null,
    termsVersion: null,
    privacyAcceptedAt: null,
    privacyVersion: null,
    onboardingCompletedAt: null,
    onboardingStatus: "terms_required",
    displayName: null,
    avatarUrl: null,
  };
}

describe("common-auth-completion-contract", () => {
  it("defines a single owner per completion stage", () => {
    const owners = Object.values(COMMON_AUTH_COMPLETION_OWNERS);
    expect(new Set(owners).size).toBe(owners.length);
    expect(COMMON_AUTH_COMPLETION_OWNERS.identity).toContain("user_auth_identities");
    expect(COMMON_AUTH_COMPLETION_OWNERS.profile).toBe("ensureAuthProfileForLogin");
    expect(COMMON_AUTH_COMPLETION_OWNERS.clientSync).toBe("syncCommonClientSessionAfterAuth");
    expect(COMMON_AUTH_COMPLETION_OWNERS.navigation).toBe("runCommonAuthClientCompletion");
  });

  it("keeps Auth Entry 440ms as a later slice stage symbol", () => {
    expect(COMMON_AUTH_COMPLETION_STAGE.entry440).toBe("CommonAuthEntry440ms");
    expect(COMMON_AUTH_COMPLETION_OWNERS.entry440).toContain("SLICE_2_6");
    expect(INTERACTION_READY_POLICY).toBe("after_single_navigation_interim");
  });

  it("destination owner uses resolvePostLoginRoute hard gate (terms only)", async () => {
    const status = termsRequiredStatus();
    const { destination } = await resolveCommonAuthDestination({} as never, {
      userId: "u1",
      next: "/market",
      status,
    });
    expect(destination).toContain("/auth/onboarding/terms");
    expect(destination).toBe(
      resolvePostLoginRoute({
        hasSession: true,
        status,
        next: "/market",
      }),
    );
  });

  it("finishClientAuthLogin must not schedule signup-status re-navigation", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/finish-client-auth-login.client.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/resolveLoginTargetFromSignupStatus/);
    expect(src).not.toMatch(/fetchSignupStatusDeduped/);
    expect(src).toMatch(/runCommonAuthClientCompletion/);
  });

  it("upsertOAuthProfileFromUser delegates to ensureAuthProfileForLogin only", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/oauth-profile-upsert.ts"),
      "utf8",
    );
    expect(src).toMatch(/ensureAuthProfileForLogin/);
    expect(src).not.toMatch(/ensurePendingAuthProfileRow/);
  });

  it("identity SSOT module resolves via user_auth_identities finder", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/provider-identity/resolve-provider-login.server.ts"),
      "utf8",
    );
    expect(src).toMatch(/findIdentityByProviderUserId/);
    expect(COMMON_AUTH_COMPLETION_OWNERS.identity).toBe(
      "resolveProviderLogin+user_auth_identities",
    );
  });

  it("runCommonAuthClientCompletion forbids signup-status corrective navigation", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/completion/run-common-auth-client-completion.client.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/fetchSignupStatusDeduped/);
    expect(src).toMatch(/after_single_navigation_interim/);
  });
});
