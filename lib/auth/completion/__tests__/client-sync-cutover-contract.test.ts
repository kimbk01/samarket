/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ensureAppBoot = vi.fn(async () => undefined);
const fetchMeProfileDeduped = vi.fn(async () => ({
  status: 200,
  json: { ok: true, profile: { id: "user-1" } },
}));
const invalidateGuestCachesForFreshLogin = vi.fn();
const clearPostLogoutBfcacheGuard = vi.fn();
const primeClientAuthSessionFromSupabase = vi.fn(async () => true);
const syncCommonClientSessionAfterAuth = vi.fn(async () => true);
const flushAndroidAuthCookies = vi.fn(async () => "flushed" as const);
const markCallMediaOnboardingPendingSource = vi.fn();
const completeAuthLifecycle = vi.fn();
const markAuthLifecycleStage = vi.fn();
const bumpAuthLifecycleCounter = vi.fn();

vi.mock("@/lib/app-boot/run-app-boot", () => ({ ensureAppBoot }));
vi.mock("@/lib/profile/fetch-me-profile-deduped", () => ({ fetchMeProfileDeduped }));
vi.mock("@/lib/auth/client-session-wipe", () => ({
  clearPostLogoutBfcacheGuard,
  invalidateGuestCachesForFreshLogin,
}));
vi.mock("@/lib/auth/auth-session-immediate.client", () => ({
  primeClientAuthSessionFromSupabase,
}));
vi.mock("@/lib/auth/completion/sync-common-client-session.client", () => ({
  syncCommonClientSessionAfterAuth,
}));
vi.mock("@/lib/auth/android-cookie-durability.client", () => ({
  flushAndroidAuthCookies,
}));
vi.mock("@/lib/permissions/dibay-device-permission-onboarding", () => ({
  markCallMediaOnboardingPendingSource,
}));
vi.mock("@/lib/auth/oauth/auth-lifecycle-trace", () => ({
  bumpAuthLifecycleCounter,
  completeAuthLifecycle,
  markAuthLifecycleStage,
}));

describe("Slice 6-3 client sync navigation gate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("native sync success: sync once then navigate; prime not used", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });
    syncCommonClientSessionAfterAuth.mockResolvedValueOnce(true);

    const { runCommonAuthClientCompletion } = await import(
      "@/lib/auth/completion/run-common-auth-client-completion.client"
    );
    const result = await runCommonAuthClientCompletion({
      destination: "/mypage",
      router: { replace },
      syncFromNativeExchangeCookies: true,
    });

    expect(result).toEqual({ ok: true });
    expect(syncCommonClientSessionAfterAuth).toHaveBeenCalledTimes(1);
    expect(primeClientAuthSessionFromSupabase).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/mypage");
    expect(bumpAuthLifecycleCounter).toHaveBeenCalledWith("navigation");
  });

  it("native sync failure: navigation 0 and fail lifecycle", async () => {
    const replace = vi.fn();
    const locationReplace = vi.fn();
    vi.stubGlobal("window", {
      location: { replace: locationReplace, origin: "https://example.com", pathname: "/login" },
    });
    syncCommonClientSessionAfterAuth.mockResolvedValueOnce(false);

    const { runCommonAuthClientCompletion } = await import(
      "@/lib/auth/completion/run-common-auth-client-completion.client"
    );
    const result = await runCommonAuthClientCompletion({
      destination: "/mypage",
      router: { replace },
      syncFromNativeExchangeCookies: true,
    });

    expect(result).toEqual({ ok: false, reason: "client_session_sync_failed" });
    expect(syncCommonClientSessionAfterAuth).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
    expect(bumpAuthLifecycleCounter).not.toHaveBeenCalledWith("navigation");
    expect(completeAuthLifecycle).toHaveBeenCalledWith(
      "fail",
      expect.objectContaining({ reason: "client_session_sync_failed" }),
    );
  });

  it("finishClientAuthLogin throws CommonClientSessionSyncError when sync fails", async () => {
    syncCommonClientSessionAfterAuth.mockResolvedValueOnce(false);
    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    const { finishClientAuthLogin, CommonClientSessionSyncError } = await import(
      "@/lib/auth/finish-client-auth-login.client"
    );
    const replace = vi.fn();
    await expect(
      finishClientAuthLogin({
        redirectTo: "/mypage",
        syncFromNativeExchangeCookies: true,
        router: { replace },
      }),
    ).rejects.toBeInstanceOf(CommonClientSessionSyncError);
    expect(replace).not.toHaveBeenCalled();
  });

  it("email path remains prime-only (no common sync)", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");
    await finishClientAuthLogin({
      redirectTo: "/mypage",
      router: { replace },
    });

    expect(syncCommonClientSessionAfterAuth).not.toHaveBeenCalled();
    expect(primeClientAuthSessionFromSupabase).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/mypage");
  });
});
