import { afterEach, describe, expect, it, vi } from "vitest";

const ensureAppBoot = vi.fn(async () => undefined);
const fetchSignupStatusDeduped = vi.fn(async () => ({
  status: 200,
  json: { route: "/market" },
}));
const invalidateGuestCachesForFreshLogin = vi.fn();
const primeClientAuthSessionFromSupabase = vi.fn(async () => true);
const consumePendingAuthAction = vi.fn(async () => true);
const clearStoredLoginRequiredDetail = vi.fn();

vi.mock("@/lib/app-boot/run-app-boot", () => ({
  ensureAppBoot,
}));

vi.mock("@/lib/auth/fetch-signup-status-client", () => ({
  fetchSignupStatusDeduped,
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

  it("uses exchange redirect without signup fetch and navigates with router.replace", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    const replace = vi.fn();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      redirectTo: "/market",
      router: { replace },
    });

    expect(primeClientAuthSessionFromSupabase).toHaveBeenCalledTimes(1);
    expect(invalidateGuestCachesForFreshLogin).toHaveBeenCalledTimes(1);
    expect(fetchSignupStatusDeduped).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/market");
    expect(ensureAppBoot).toHaveBeenCalledTimes(1);
  });
});
