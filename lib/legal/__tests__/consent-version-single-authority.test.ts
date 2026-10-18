/**
 * B11 — every consent decision point judges against the server-required (CMS) versions, so an
 * Admin publish of a new version cannot make server and client disagree.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";
import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";

const V2 = { termsVersion: "2026-11-v2", privacyVersion: "2026-11-v2" };
const AT = "2026-10-18T00:00:00Z";

function status(version: string, required: typeof V2 | null): OnboardingStatus {
  return {
    profileExists: true,
    usernameComplete: true,
    dibayIdComplete: true,
    nicknameComplete: true,
    consentComplete: version === required?.termsVersion,
    addressComplete: true,
    phoneVerified: true,
    profileComplete: true,
    signupComplete: version === required?.termsVersion,
    isPrivilegedAdmin: false,
    dibayId: "abc",
    dibayIdLocked: true,
    username: "abc",
    usernameConfirmed: true,
    termsAcceptedAt: AT,
    termsVersion: version,
    privacyAcceptedAt: AT,
    privacyVersion: version,
    onboardingCompletedAt: AT,
    onboardingStatus: "completed",
    displayName: "n",
    avatarUrl: "a",
    requiredConsent: required,
  };
}

describe("B11 login destination uses the CMS-required version", () => {
  it("member who agreed to the new version is NOT sent back to terms", async () => {
    const { resolvePostLoginRoute } = await import("@/lib/auth/resolve-post-login-route");
    expect(resolvePostLoginRoute({ hasSession: true, status: status(V2.termsVersion, V2), next: "/market" })).toBe(
      "/market",
    );
  });
  it("member on the old version IS sent to terms", async () => {
    const { resolvePostLoginRoute } = await import("@/lib/auth/resolve-post-login-route");
    expect(
      resolvePostLoginRoute({ hasSession: true, status: status(STORE_TERMS_VERSION, V2), next: "/market" }),
    ).toMatch(/^\/auth\/onboarding\/terms/);
  });
});

describe("B11 client gate uses server-provided versions", () => {
  beforeEach(async () => {
    const m = await import("@/lib/legal/client-required-consent");
    m.resetClientRequiredConsentVersionsForTests();
  });

  it("isClientSignupComplete follows setClientRequiredConsentVersions", async () => {
    const { setClientRequiredConsentVersions } = await import("@/lib/legal/client-required-consent");
    const { isClientSignupComplete } = await import("@/lib/auth/client-signup-gate");
    const user = {
      id: "u1",
      terms_accepted_at: AT,
      terms_version: V2.termsVersion,
      privacy_accepted_at: AT,
      privacy_version: V2.privacyVersion,
    } as never;
    // unknown → legacy STORE_* fallback (server decides)
    expect(isClientSignupComplete(user)).toBe(false);
    setClientRequiredConsentVersions(V2);
    expect(isClientSignupComplete(user)).toBe(true);
  });

  it("version change notifies subscribers (running app re-check)", async () => {
    const m = await import("@/lib/legal/client-required-consent");
    const seen: string[] = [];
    m.subscribeClientRequiredConsentVersions((next) => seen.push(next.termsVersion));
    expect(m.setClientRequiredConsentVersions({ termsVersion: "a", privacyVersion: "a" })).toBe(false);
    expect(m.setClientRequiredConsentVersions({ termsVersion: "a", privacyVersion: "a" })).toBe(false);
    expect(m.setClientRequiredConsentVersions({ termsVersion: "b", privacyVersion: "b" })).toBe(true);
    expect(seen).toEqual(["b"]);
  });
});

describe("B16 required versions never fail open on CMS read failure", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/legal/load-published-legal-document");
    vi.resetModules();
  });

  async function load(results: Array<{ ok: boolean; row?: { version: string } | null }>) {
    vi.resetModules();
    let i = 0;
    vi.doMock("@/lib/legal/load-published-legal-document", () => ({
      loadPublishedAppLegalDocumentResult: vi.fn(async () => {
        const r = results[Math.min(i, results.length - 1)];
        i += 1;
        return r.ok ? { ok: true, row: r.row ?? null } : { ok: false, reason: "read_failed" };
      }),
    }));
    return import("@/lib/legal/resolve-required-consent-versions");
  }

  it("read failure with no prior read → strict throws, lenient returns STORE fallback", async () => {
    const m = await load([{ ok: false }]);
    await expect(m.resolveRequiredConsentVersionsStrict()).rejects.toBeInstanceOf(
      m.RequiredConsentVersionsUnavailableError,
    );
    const lenient = await m.resolveRequiredConsentVersions();
    expect(lenient.source).toBe("fallback");
  });

  it("read failure after a good read → keeps last good CMS version (not STORE fallback)", async () => {
    const m = await load([
      { ok: true, row: { version: "2026-11-v2" } },
      { ok: true, row: { version: "2026-11-v2" } },
      { ok: false },
    ]);
    const first = await m.resolveRequiredConsentVersionsStrict();
    expect(first.termsVersion).toBe("2026-11-v2");
    m.clearRequiredConsentVersionsCache();
    const second = await m.resolveRequiredConsentVersionsStrict();
    expect(second.termsVersion).toBe("2026-11-v2");
  });

  it("no published row (ok) → STORE fallback is legitimate", async () => {
    const m = await load([{ ok: true, row: null }]);
    const v = await m.resolveRequiredConsentVersionsStrict();
    expect(v.termsVersion).toBe(STORE_TERMS_VERSION);
    expect(v.source).toBe("fallback");
  });
});
