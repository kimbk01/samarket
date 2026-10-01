import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startNativeKakaoLogin = vi.fn();
const startNativeAppleLogin = vi.fn();
const startNativeGoogleLogin = vi.fn();
const isNativeKakaoLoginAvailable = vi.fn();
const isNativeAppleLoginAvailable = vi.fn();
const isNativeGoogleLoginAvailable = vi.fn();

vi.mock("@/lib/auth/native/start-native-kakao-login.client", () => ({
  startNativeKakaoLogin: (...args: unknown[]) => startNativeKakaoLogin(...args),
}));

vi.mock("@/lib/auth/native/start-native-apple-login.client", () => ({
  startNativeAppleLogin: (...args: unknown[]) => startNativeAppleLogin(...args),
}));

vi.mock("@/lib/auth/native/start-native-google-login.client", () => ({
  startNativeGoogleLogin: (...args: unknown[]) => startNativeGoogleLogin(...args),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isNativeKakaoLoginAvailable: () => isNativeKakaoLoginAvailable(),
  isNativeAppleLoginAvailable: () => isNativeAppleLoginAvailable(),
  isNativeGoogleLoginAvailable: () => isNativeGoogleLoginAvailable(),
}));

describe("start-native-provider-login.client", () => {
  beforeEach(() => {
    startNativeKakaoLogin.mockReset();
    startNativeAppleLogin.mockReset();
    startNativeGoogleLogin.mockReset();
    isNativeKakaoLoginAvailable.mockReturnValue(true);
    isNativeAppleLoginAvailable.mockReturnValue(true);
    isNativeGoogleLoginAvailable.mockReturnValue(true);
    startNativeKakaoLogin.mockResolvedValue(undefined);
    startNativeAppleLogin.mockResolvedValue(undefined);
    startNativeGoogleLogin.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes kakao to startNativeKakaoLogin", async () => {
    const { startNativeProviderLogin } = await import("@/lib/auth/native/start-native-provider-login.client");
    await startNativeProviderLogin({ provider: "kakao", next: "/market" });
    expect(startNativeKakaoLogin).toHaveBeenCalledWith({ next: "/market" });
  });

  it("routes apple to startNativeAppleLogin", async () => {
    const { startNativeProviderLogin } = await import("@/lib/auth/native/start-native-provider-login.client");
    await startNativeProviderLogin({ provider: "apple" });
    expect(startNativeAppleLogin).toHaveBeenCalledWith({ next: null });
  });

  it("routes google to startNativeGoogleLogin when available", async () => {
    const { startNativeProviderLogin } = await import("@/lib/auth/native/start-native-provider-login.client");
    await startNativeProviderLogin({ provider: "google", next: "/market" });
    expect(startNativeGoogleLogin).toHaveBeenCalledWith({ next: "/market" });
  });

  it("rejects google when native SDK unavailable on platform", async () => {
    isNativeGoogleLoginAvailable.mockReturnValue(false);
    const { startNativeProviderLogin, NativeProviderLoginError } = await import(
      "@/lib/auth/native/start-native-provider-login.client"
    );
    await expect(startNativeProviderLogin({ provider: "google" })).rejects.toMatchObject({
      code: "google_native_unavailable",
      provider: "google",
    });
  });

  it("rejects facebook with native_provider_not_implemented", async () => {
    const { startNativeProviderLogin } = await import("@/lib/auth/native/start-native-provider-login.client");
    await expect(startNativeProviderLogin({ provider: "facebook" })).rejects.toMatchObject({
      code: "native_provider_not_implemented",
      provider: "facebook",
    });
  });
});
