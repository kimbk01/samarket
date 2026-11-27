import { afterEach, describe, expect, it, vi } from "vitest";

const ensureAppBoot = vi.fn(async () => undefined);
const fetchMeProfileDeduped = vi.fn(async () => ({
  status: 200,
  json: { ok: true, profile: { id: "user-1" } },
}));
const invalidateGuestCachesForFreshLogin = vi.fn();
const primeClientAuthSessionFromSupabase = vi.fn(async () => true);
const consumePendingAuthAction = vi.fn(async () => true);
const clearStoredLoginRequiredDetail = vi.fn();
const markCallMediaOnboardingPendingSource = vi.fn();
const syncCommonClientSessionAfterAuth = vi.fn(async () => true);

vi.mock("@/lib/app-boot/run-app-boot", () => ({
  ensureAppBoot,
}));

vi.mock("@/lib/profile/fetch-me-profile-deduped", () => ({
  fetchMeProfileDeduped,
}));

const clearPostLogoutBfcacheGuard = vi.fn();
vi.mock("@/lib/auth/client-session-wipe", () => ({
  clearPostLogoutBfcacheGuard,
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

vi.mock("@/lib/auth/completion/sync-common-client-session.client", () => ({
  syncCommonClientSessionAfterAuth,
}));

describe("finishClientAuthLogin", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  /**
   * 「로그인 필요」 창 로그인도 공통 준비(손님 캐시·부팅 갱신 → 로그아웃 표시 삭제 → 세션 준비)를 거친다.
   * 예전 단언(`invalidateGuestCachesForFreshLogin` 미호출)은 로그아웃 뒤 표시가 남고 부팅이 「익명」에 남는 결함을 고정하고 있었다
   * (docs/audit/signup-mypage-skeleton-fix-design-2026-11-27.md §8).
   */
  it("pending token: common prepare (guest cache + boot upgrade, guard clear, prime) then consumes action without navigation", async () => {
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");
    const onCloseModal = vi.fn();
    const replace = vi.fn();

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/" },
    });

    await finishClientAuthLogin({
      pendingToken: "tok-1",
      onCloseModal,
      router: { replace },
    });

    expect(invalidateGuestCachesForFreshLogin).toHaveBeenCalledTimes(1);
    expect(clearPostLogoutBfcacheGuard).toHaveBeenCalledTimes(1);
    expect(primeClientAuthSessionFromSupabase).toHaveBeenCalledTimes(1);
    expect(invalidateGuestCachesForFreshLogin.mock.invocationCallOrder[0]).toBeLessThan(
      primeClientAuthSessionFromSupabase.mock.invocationCallOrder[0]!,
    );
    expect(clearPostLogoutBfcacheGuard.mock.invocationCallOrder[0]).toBeLessThan(
      primeClientAuthSessionFromSupabase.mock.invocationCallOrder[0]!,
    );
    expect(consumePendingAuthAction).toHaveBeenCalledWith("tok-1");
    expect(primeClientAuthSessionFromSupabase.mock.invocationCallOrder[0]).toBeLessThan(
      consumePendingAuthAction.mock.invocationCallOrder[0]!,
    );
    expect(onCloseModal).toHaveBeenCalledTimes(1);
    expect(clearStoredLoginRequiredDetail).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // 부팅 재시작은 대기 동작보다 먼저 (대기 동작이 오래 걸리거나 실패해도 부팅이 「갱신 대기」에 머물지 않게)
    expect(ensureAppBoot.mock.invocationCallOrder[0]).toBeLessThan(
      consumePendingAuthAction.mock.invocationCallOrder[0]!,
    );
  });

  it("pending action that throws still leaves the boot restarted", async () => {
    consumePendingAuthAction.mockRejectedValueOnce(new Error("action_failed"));
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");
    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/" },
    });
    await expect(finishClientAuthLogin({ pendingToken: "tok-3" })).rejects.toThrow("action_failed");
    expect(ensureAppBoot).toHaveBeenCalled();
  });

  it("pending token not consumed: falls through to navigation without preparing twice", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    const replace = vi.fn();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      pendingToken: "tok-gone",
      redirectTo: "/market",
      needsTermsAgreement: false,
      signupComplete: true,
      router: { replace },
    });

    expect(invalidateGuestCachesForFreshLogin).toHaveBeenCalledTimes(1);
    expect(clearPostLogoutBfcacheGuard).toHaveBeenCalledTimes(1);
    expect(primeClientAuthSessionFromSupabase).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/market");
  });

  it("pending token with native exchange sync failure throws and does not run the action", async () => {
    syncCommonClientSessionAfterAuth.mockResolvedValueOnce(false);
    const { finishClientAuthLogin, CommonClientSessionSyncError } = await import(
      "@/lib/auth/finish-client-auth-login.client"
    );
    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/" },
    });
    await expect(
      finishClientAuthLogin({ pendingToken: "tok-2", syncFromNativeExchangeCookies: true }),
    ).rejects.toBeInstanceOf(CommonClientSessionSyncError);
    expect(consumePendingAuthAction).not.toHaveBeenCalled();
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
    expect(replace).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMeProfileDeduped).not.toHaveBeenCalled();
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
    expect(replace).toHaveBeenCalledTimes(1);
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

  it("navigates after session prime only — boot warms in background without signup-status re-nav", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
    const replace = vi.fn();

    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");

    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    await finishClientAuthLogin({
      next: "/philife",
      router: { replace },
    });

    expect(replace).toHaveBeenCalledWith("/philife");
    expect(replace).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMeProfileDeduped).not.toHaveBeenCalled();
    expect(ensureAppBoot).toHaveBeenCalled();
  });

  it("uses next as immediate target and never re-navigates", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
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
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("does not correct route via signup-status when landing on default mypage", async () => {
    consumePendingAuthAction.mockResolvedValueOnce(false);
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
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
