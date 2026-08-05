/**
 * @vitest-environment jsdom
 *
 * Slice 6-7 First Break: UI OAuth success must forward syncFromNativeExchangeCookies
 * into finishClientAuthLogin without dropping the Native Thin Handoff flag.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNativeAuthCompletionHandoff } from "@/lib/auth/completion/build-native-auth-completion-handoff.client";

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

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Extract finishClientAuthLogin({...}) object literal that includes redirectTo: input.redirectTo */
function extractOauthFinishCallBlock(src: string): string {
  const marker = "redirectTo: input.redirectTo";
  const idx = src.indexOf(marker);
  expect(idx, "oauth finish call missing").toBeGreaterThanOrEqual(0);
  const open = src.lastIndexOf("finishClientAuthLogin(", idx);
  expect(open).toBeGreaterThanOrEqual(0);
  const brace = src.indexOf("{", open);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(brace, i + 1);
    }
  }
  throw new Error("unclosed finishClientAuthLogin object");
}

describe("Slice 6-7 UI client-sync handoff First Break fix", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("Thin Handoff builder still sets syncFromNativeExchangeCookies=true", () => {
    const handoff = buildNativeAuthCompletionHandoff({
      redirectTo: "/mypage",
      needsTermsAgreement: false,
      signupComplete: true,
    });
    expect(handoff.syncFromNativeExchangeCookies).toBe(true);
  });

  it("LoginPageClient OAuth success forwards syncFromNativeExchangeCookies", () => {
    const block = extractOauthFinishCallBlock(read("app/login/LoginPageClient.tsx"));
    expect(block).toMatch(
      /syncFromNativeExchangeCookies:\s*input\.syncFromNativeExchangeCookies\s*===\s*true/,
    );
  });

  it("AuthModal OAuth success forwards syncFromNativeExchangeCookies", () => {
    const block = extractOauthFinishCallBlock(read("components/auth/AuthModal.tsx"));
    expect(block).toMatch(
      /syncFromNativeExchangeCookies:\s*input\.syncFromNativeExchangeCookies\s*===\s*true/,
    );
  });

  it("Email / session-restore finish calls do not force native sync flag", () => {
    const login = read("app/login/LoginPageClient.tsx");
    const modal = read("components/auth/AuthModal.tsx");
    // Non-OAuth finish sites must not hardcode syncFromNativeExchangeCookies: true
    const loginNonOauth = login.replace(extractOauthFinishCallBlock(login), "");
    const modalNonOauth = modal.replace(extractOauthFinishCallBlock(modal), "");
    expect(loginNonOauth).not.toMatch(/syncFromNativeExchangeCookies:\s*true/);
    expect(modalNonOauth).not.toMatch(/syncFromNativeExchangeCookies:\s*true/);
  });

  it("flag=true → syncCommon once, prime 0, navigation 1", async () => {
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
    expect(markAuthLifecycleStage).toHaveBeenCalledWith(
      "client_session_visible",
      expect.objectContaining({ via: "syncCommonClientSessionAfterAuth" }),
    );
  });

  it("flag=false/undefined → prime-only (Email path)", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { replace: vi.fn(), origin: "https://example.com", pathname: "/login" },
    });

    const { runCommonAuthClientCompletion } = await import(
      "@/lib/auth/completion/run-common-auth-client-completion.client"
    );
    const result = await runCommonAuthClientCompletion({
      destination: "/mypage",
      router: { replace },
    });

    expect(result).toEqual({ ok: true });
    expect(syncCommonClientSessionAfterAuth).not.toHaveBeenCalled();
    expect(primeClientAuthSessionFromSupabase).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(markAuthLifecycleStage).toHaveBeenCalledWith(
      "client_session_visible",
      expect.objectContaining({ via: "runCommonAuthClientCompletion_prime" }),
    );
  });

  it("flag=true sync failure → navigation 0", async () => {
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
  });

  it("finishClientAuthLogin forwards native flag into runCommonAuthClientCompletion", async () => {
    const runCommon = vi.fn(async () => ({ ok: true as const }));
    vi.doMock("@/lib/auth/completion/run-common-auth-client-completion.client", () => ({
      runCommonAuthClientCompletion: runCommon,
    }));
    vi.resetModules();
    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");
    const replace = vi.fn();
    await finishClientAuthLogin({
      redirectTo: "/mypage",
      syncFromNativeExchangeCookies: true,
      router: { replace },
    });
    expect(runCommon).toHaveBeenCalledTimes(1);
    const callArg = runCommon.mock.calls.at(0)?.at(0) as
      | { destination?: string; syncFromNativeExchangeCookies?: boolean }
      | undefined;
    expect(callArg).toEqual(
      expect.objectContaining({
        destination: "/mypage",
        syncFromNativeExchangeCookies: true,
      }),
    );
  });
});
