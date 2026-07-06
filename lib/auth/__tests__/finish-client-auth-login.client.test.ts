import { afterEach, describe, expect, it, vi } from "vitest";

const ensureAppBoot = vi.fn(async () => undefined);
const fetchSignupStatusDeduped = vi.fn(async () => ({
  status: 200,
  json: { route: "/auth/onboarding/consent" },
}));
const fetchMeProfileDeduped = vi.fn(async () => ({
  status: 200,
  json: { ok: true, profile: { id: "user-1" } },
}));
const invalidateGuestCachesForFreshLogin = vi.fn();
const primeClientAuthSessionFromSupabase = vi.fn(async () => true);
const consumePendingAuthAction = vi.fn(async () => true);
const clearStoredLoginRequiredDetail = vi.fn();
const markCallMediaOnboardingPendingSource = vi.fn();

vi.mock("@/lib/app-boot/run-app-boot", () => ({
  ensureAppBoot,
}));

vi.mock("@/lib/auth/fetch-signup-status-client", () => ({
  fetchSignupStatusDeduped,
}));

vi.mock("@/lib/profile/fetch-me-profile-deduped", () => ({
  fetchMeProfileDeduped,
}));

vi.mock("@/lib/auth/client-session-wipe", () => ({
  clearPostLogoutBfcacheGuard: vi.fn(),
  invalidateGuestCachesForFreshLogin,
}));

vi.mock("@/lib/auth/auth-session-immediate.client", () => ({
  primeClientAuthSessionFromSupabase,
}));

vi.mock("@/lib/auth/require-auth-action", () => ({
  consumePendingAuthAction,
  clearStoredLoginRequiredDetail,
}));

vi.mock("@/lib/permissions/dibay-device-permission-onboarding", () => ({
  markCallMediaOnboardingPendingSource,
}));

describe("finishClientAuthLogin", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("primes session and consumes pending action without boot when token succeeds", async () => {
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");
    const onCloseModal = vi.fn();

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/" },
    });

    await finishClientAuthLogin({
      pendingToken: "tok-1",
      onCloseModal,
    });

    expect(primeClientAuthSessionFromSupabase).toHaveBeenCalledTimes(1);
    expect(consumePendingAuthAction).toHaveBeenCalledWith("tok-1");
    expect(onCloseModal).toHaveBeenCalledTimes(1);
    expect(clearStoredLoginRequiredDetail).toHaveBeenCalled();
    expect(invalidateGuestCachesForFreshLogin).not.toHaveBeenCalled();
    expect(ensureAppBoot).toHaveBeenCalledTimes(1);
  });

  it("uses exchange redirect without signup fetch when terms are already complete", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    const replace = vi.fn();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      redirectTo: "/market",
      needsTermsAgreement: false,
      signupComplete: true,
      router: { replace },
    });

    expect(primeClientAuthSessionFromSupabase).toHaveBeenCalledTimes(1);
    expect(invalidateGuestCachesForFreshLogin).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/market");
    expect(fetchSignupStatusDeduped).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMeProfileDeduped).toHaveBeenCalled();
    expect(ensureAppBoot).toHaveBeenCalledTimes(1);
  });

  it("routes to terms when exchange redirectTo is /mypage but needsTermsAgreement is true", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    const replace = vi.fn();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      redirectTo: "/mypage",
      needsTermsAgreement: true,
      signupComplete: false,
      router: { replace },
    });

    expect(replace).toHaveBeenCalledWith("/auth/onboarding/terms");
    expect(fetchSignupStatusDeduped).not.toHaveBeenCalled();
  });

  it("preserves deep link next on terms redirect when terms are required", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    const replace = vi.fn();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      redirectTo: "/mypage",
      needsTermsAgreement: true,
      next: "/community-messenger/rooms/room-abc",
      router: { replace },
    });

    expect(replace).toHaveBeenCalledWith(
      "/auth/onboarding/terms?next=%2Fcommunity-messenger%2Frooms%2Froom-abc",
    );
  });

  it("keeps redirectTo when consent is already complete", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    const replace = vi.fn();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      redirectTo: "/philife",
      needsTermsAgreement: false,
      consentComplete: true,
      signupComplete: true,
      router: { replace },
    });

    expect(replace).toHaveBeenCalledWith("/philife");
  });

  it("navigates after session prime only — profile and signup-status run in background", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    let replaceCalled = false;
    const replace = vi.fn(() => {
      replaceCalled = true;
    });

    fetchMeProfileDeduped.mockImplementation(
      () =>
        new Promise((resolve) => {
          expect(replaceCalled).toBe(true);
          resolve({ status: 200, json: { ok: true, profile: { id: "user-1" } } });
        })
    );

    fetchSignupStatusDeduped.mockImplementation(
      () =>
        new Promise((resolve) => {
          expect(replaceCalled).toBe(true);
          resolve({ status: 200, json: { route: "/auth/onboarding/consent" } });
        })
    );

    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      next: "/philife",
      router: { replace },
    });

    expect(replace).toHaveBeenCalledWith("/philife");
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMeProfileDeduped).toHaveBeenCalled();
    expect(fetchSignupStatusDeduped).toHaveBeenCalled();
    expect(ensureAppBoot).toHaveBeenCalled();
  });

  it("uses next as immediate target without blocking on signup-status", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    fetchSignupStatusDeduped.mockResolvedValueOnce({
      status: 200,
      json: { route: "/market" },
    });
    const replace = vi.fn();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      next: "/market",
      router: { replace },
    });

    expect(replace).toHaveBeenCalledWith("/market");
    expect(replace).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchSignupStatusDeduped).toHaveBeenCalled();
  });

  it("corrects route in background when signup-status differs from immediate fallback", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    fetchSignupStatusDeduped.mockResolvedValueOnce({
      status: 200,
      json: { route: "/market" },
    });
    const replace = vi.fn();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      router: { replace },
    });

    expect(replace).toHaveBeenCalledWith("/mypage");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSignupStatusDeduped).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenLastCalledWith("/market");
  });
});
