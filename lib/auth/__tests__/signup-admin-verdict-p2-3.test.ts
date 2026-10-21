/**
 * P2-3 (SG-04) — 동의 미기록 membership 관리자: Destination·proxy gate·signup-status 가
 * getOnboardingStatus / resolveMemberConsentAuthority 와 같은 "완료" 판정을 낸다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";

function adminStatusWithoutConsent(isPrivilegedAdmin: boolean): OnboardingStatus {
  return {
    profileExists: true,
    usernameComplete: false,
    dibayIdComplete: false,
    nicknameComplete: true,
    consentComplete: false,
    addressComplete: false,
    phoneVerified: true,
    profileComplete: false,
    signupComplete: isPrivilegedAdmin,
    isPrivilegedAdmin,
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

describe("P2-3 resolvePostLoginRoute uses membership verdict", () => {
  it("membership admin without consent → not routed to terms", () => {
    const route = resolvePostLoginRoute({
      hasSession: true,
      status: adminStatusWithoutConsent(true),
      next: "/admin",
    });
    expect(route).not.toContain("/auth/onboarding/terms");
  });

  it("non-admin without consent → still terms", () => {
    const route = resolvePostLoginRoute({
      hasSession: true,
      status: adminStatusWithoutConsent(false),
      next: "/philife",
    });
    expect(route).toContain("/auth/onboarding/terms");
  });

  it("signup-status route passes privilegedAdmin from getOnboardingStatus", () => {
    const src = readFileSync(resolve(process.cwd(), "app/api/me/signup-status/route.ts"), "utf8");
    expect(src).toContain("privilegedAdmin: onboarding.isPrivilegedAdmin");
  });
});

describe("P2-3 proxy signup gate uses membership verdict", () => {
  beforeEach(() => vi.resetModules());

  function fakeSb(row: Record<string, unknown>) {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: row, error: null }),
    });
    return { from: () => chain } as never;
  }

  const row = {
    id: "u1",
    terms_accepted_at: null,
    terms_version: null,
    privacy_accepted_at: null,
    privacy_version: null,
    role: "user",
  };

  async function load(isAdmin: boolean) {
    vi.doMock("@/lib/legal/resolve-required-consent-versions", () => ({
      resolveRequiredConsentVersions: async () => ({ termsVersion: "t1", privacyVersion: "p1" }),
    }));
    const membership = vi.fn(async () => isAdmin);
    vi.doMock("@/lib/admin/admin-membership", () => ({
      hasActiveAdminMembershipOrLegacyRole: membership,
    }));
    const mod = await import("@/lib/auth/proxy-signup-gate");
    return { mod, membership };
  }

  it("membership admin without consent → no redirect", async () => {
    const { mod } = await load(true);
    expect(await mod.resolveProxySignupGateRedirect(fakeSb(row), "u1", "/write")).toBeNull();
  });

  it("non-admin without consent → redirect to terms", async () => {
    const { mod } = await load(false);
    const r = await mod.resolveProxySignupGateRedirect(fakeSb(row), "u1", "/write");
    expect(r).toContain("/auth/onboarding/terms");
  });

  it("consented member → membership not queried (hot path cost 0)", async () => {
    const { mod, membership } = await load(false);
    const consented = {
      ...row,
      terms_accepted_at: "2026-01-01",
      terms_version: "t1",
      privacy_accepted_at: "2026-01-01",
      privacy_version: "p1",
    };
    expect(await mod.resolveProxySignupGateRedirect(fakeSb(consented), "u1", "/write")).toBeNull();
    expect(membership).not.toHaveBeenCalled();
  });
});
