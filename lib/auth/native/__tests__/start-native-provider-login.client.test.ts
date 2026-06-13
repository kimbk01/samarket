import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startNativeKakaoLogin = vi.fn();
const startNativeAppleLogin = vi.fn();
const isNativeKakaoLoginAvailable = vi.fn();
const isNativeAppleLoginAvailable = vi.fn();

vi.mock("@/lib/auth/native/start-native-kakao-login.client", () => ({
  startNativeKakaoLogin: (...args: unknown[]) => startNativeKakaoLogin(...args),
}));

vi.mock("@/lib/auth/native/start-native-apple-login.client", () => ({
  startNativeAppleLogin: (...args: unknown[]) => startNativeAppleLogin(...args),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isNativeKakaoLoginAvailable: () => isNativeKakaoLoginAvailable(),
  isNativeAppleLoginAvailable: () => isNativeAppleLoginAvailable(),
}));

describe("start-native-provider-login.client", () => {
  beforeEach(() => {
    startNativeKakaoLogin.mockReset();
    startNativeAppleLogin.mockReset();
    isNativeKakaoLoginAvailable.mockReturnValue(true);
    isNativeAppleLoginAvailable.mockReturnValue(true);
    startNativeKakaoLogin.mockResolvedValue(undefined);
    startNativeAppleLogin.mockResolvedValue(undefined);
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

  it("rejects google with native_provider_not_implemented", async () => {
    const { startNativeProviderLogin, NativeProviderLoginError } = await import(
      "@/lib/auth/native/start-native-provider-login.client"
    );
    await expect(startNativeProviderLogin({ provider: "google" })).rejects.toBeInstanceOf(
      NativeProviderLoginError,
    );
    await expect(startNativeProviderLogin({ provider: "google" })).rejects.toMatchObject({
      code: "native_provider_not_implemented",
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
