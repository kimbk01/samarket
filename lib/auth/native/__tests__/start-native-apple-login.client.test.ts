import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetOAuthFlowForTests, isOAuthFlowInFlight } from "@/lib/auth/oauth/native-oauth-contract";

const invokeNativeAppleSignIn = vi.fn();
const isNativeAppleLoginAvailable = vi.fn();
const syncCommonClientSessionAfterAuthMock = vi.fn(async () => true);

vi.mock("@/lib/auth/native/native-apple-auth-plugin", () => ({
  invokeNativeAppleSignIn: (...args: unknown[]) => invokeNativeAppleSignIn(...args),
  NativeAppleAuthError: class NativeAppleAuthError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.name = code;
      this.code = code;
    }
  },
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isNativeAppleLoginAvailable: () => isNativeAppleLoginAvailable(),
}));

vi.mock("@/lib/auth/oauth/oauth-native-callback-log", () => ({
  logOAuthNativeEvent: vi.fn(),
}));

vi.mock("@/lib/auth/completion/sync-common-client-session.client", () => ({
  syncCommonClientSessionAfterAuth: () => syncCommonClientSessionAfterAuthMock(),
}));

function mockWindowLocationReplace(replace = vi.fn()) {
  vi.stubGlobal("window", {
    location: { replace, href: "http://localhost/" },
  });
  return replace;
}

describe("start-native-apple-login.client", () => {
  beforeEach(() => {
    resetOAuthFlowForTests();
    isNativeAppleLoginAvailable.mockReturnValue(true);
    syncCommonClientSessionAfterAuthMock.mockReset();
    syncCommonClientSessionAfterAuthMock.mockResolvedValue(true);
    invokeNativeAppleSignIn.mockResolvedValue({
      provider: "apple",
      identityToken: "jwt-test",
      userIdentifier: "apple-uid",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: false,
          errorCode: "native_exchange_not_implemented",
          message: "stub",
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetOAuthFlowForTests();
  });

  it("rejects when native apple is unavailable", async () => {
    isNativeAppleLoginAvailable.mockReturnValue(false);
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await expect(startNativeAppleLogin()).rejects.toMatchObject({ code: "apple_native_unavailable" });
  });

  it("releases oauth lock on user cancel", async () => {
    const { NativeAppleAuthError } = await import("@/lib/auth/native/native-apple-auth-plugin");
    invokeNativeAppleSignIn.mockRejectedValue(new NativeAppleAuthError("user_cancelled"));
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await expect(startNativeAppleLogin()).rejects.toMatchObject({ code: "user_cancelled" });
    expect(isOAuthFlowInFlight()).toBe(false);
  });

  it("returns exchange not ready when API is 501", async () => {
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await expect(startNativeAppleLogin()).rejects.toMatchObject({ code: "apple_native_exchange_not_ready" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/native/exchange",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"identityToken":"jwt-test"'),
      }),
    );
    expect(isOAuthFlowInFlight()).toBe(false);
  });

  it("does not create session on 501 — no redirect", async () => {
    const replace = mockWindowLocationReplace();
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await expect(startNativeAppleLogin()).rejects.toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("returns handoff after successful exchange and common client sync", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          provider: "apple",
          signupComplete: false,
          redirectTo: "/signup/terms",
          sessionEstablished: true,
        }),
      }),
    );
    const replace = mockWindowLocationReplace();
    const { logOAuthNativeEvent } = await import("@/lib/auth/oauth/oauth-native-callback-log");
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    const result = await startNativeAppleLogin();
    expect(result.redirectTo).toBe("/signup/terms");
    expect(replace).not.toHaveBeenCalled();
    expect(isOAuthFlowInFlight()).toBe(false);
    expect(syncCommonClientSessionAfterAuthMock).toHaveBeenCalledTimes(1);

    const exchangeSuccessCalls = vi
      .mocked(logOAuthNativeEvent)
      .mock.calls.filter(([event]) => event === "apple_native_exchange_success");
    expect(exchangeSuccessCalls).toHaveLength(1);
  });

  it("does not return handoff when client session sync fails after exchange", async () => {
    syncCommonClientSessionAfterAuthMock.mockResolvedValueOnce(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          provider: "apple",
          signupComplete: true,
          redirectTo: "/mypage",
          sessionEstablished: true,
        }),
      }),
    );
    const replace = mockWindowLocationReplace();
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await expect(startNativeAppleLogin()).rejects.toMatchObject({
      code: "apple_native_exchange_not_ready",
    });
    expect(syncCommonClientSessionAfterAuthMock).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("skips common sync on user cancel before exchange", async () => {
    const { NativeAppleAuthError } = await import("@/lib/auth/native/native-apple-auth-plugin");
    invokeNativeAppleSignIn.mockRejectedValue(new NativeAppleAuthError("user_cancelled"));
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await expect(startNativeAppleLogin()).rejects.toMatchObject({ code: "user_cancelled" });
    expect(syncCommonClientSessionAfterAuthMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips common sync on verify failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: false,
          errorCode: "apple_token_verify_failed",
          message: "invalid",
        }),
      }),
    );
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await expect(startNativeAppleLogin()).rejects.toMatchObject({ code: "apple_native_verify_failed" });
    expect(syncCommonClientSessionAfterAuthMock).not.toHaveBeenCalled();
  });

  it("logs apple_native_started and apple_native_success once each on happy path start", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          provider: "apple",
          signupComplete: false,
          redirectTo: "/market",
          sessionEstablished: true,
        }),
      }),
    );
    mockWindowLocationReplace();
    const { logOAuthNativeEvent } = await import("@/lib/auth/oauth/oauth-native-callback-log");
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await startNativeAppleLogin();

    expect(
      vi.mocked(logOAuthNativeEvent).mock.calls.filter(([event]) => event === "apple_native_started"),
    ).toHaveLength(1);
    expect(
      vi.mocked(logOAuthNativeEvent).mock.calls.filter(([event]) => event === "apple_native_success"),
    ).toHaveLength(1);
  });

  it("maps 401 verify failure to apple_native_verify_failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: false,
          errorCode: "apple_token_verify_failed",
          message: "invalid",
        }),
      }),
    );
    const { startNativeAppleLogin } = await import("@/lib/auth/native/start-native-apple-login.client");
    await expect(startNativeAppleLogin()).rejects.toMatchObject({ code: "apple_native_verify_failed" });
  });
});
