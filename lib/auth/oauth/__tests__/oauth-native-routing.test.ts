import { describe, expect, it } from "vitest";
import { resolveOAuthNativeRoutingDecision } from "@/lib/auth/oauth/oauth-native-routing";

describe("oauth-native-routing", () => {
  it("keeps web OAuth on browser shell", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "google",
        isNativeAppShell: false,
      }),
    ).toEqual({ action: "web_oauth_start" });

    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "kakao",
        isNativeAppShell: false,
      }),
    ).toEqual({ action: "web_oauth_start" });

    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "apple",
        isNativeAppShell: false,
        shellPlatform: null,
      }),
    ).toEqual({
      action: "web_oauth_start",
      webOAuthFallbackReason: "browser_or_non_ios_shell",
    });
  });

  it("blocks google on native Android app when SDK unavailable", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "google",
        isNativeAppShell: true,
        shellPlatform: "android",
        isNativeProviderAvailable: () => false,
      }),
    ).toEqual({
      action: "native_blocked",
      errorCode: "google_native_unavailable",
    });
  });

  it("falls back to web OAuth for google on iOS native shell", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "google",
        isNativeAppShell: true,
        shellPlatform: "ios",
        isNativeProviderAvailable: () => false,
      }),
    ).toEqual({ action: "web_oauth_start" });
  });

  it("routes google to native provider login when SDK available", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "google",
        isNativeAppShell: true,
        isNativeProviderAvailable: () => true,
      }),
    ).toEqual({ action: "native_provider_login" });
  });

  it("blocks facebook on native app without Custom Tab fallback", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "facebook",
        isNativeAppShell: true,
      }),
    ).toEqual({
      action: "native_blocked",
      errorCode: "native_provider_not_implemented",
    });
  });

  it("routes kakao and apple to native provider login when SDK available", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "kakao",
        isNativeAppShell: true,
        shellPlatform: "android",
        isNativeProviderAvailable: () => true,
      }),
    ).toEqual({ action: "native_provider_login" });

    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "apple",
        isNativeAppShell: true,
        isNativeProviderAvailable: () => true,
      }),
    ).toEqual({ action: "native_provider_login" });
  });

  it("uses web OAuth for kakao on iOS native shell (Talk return broken)", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "kakao",
        isNativeAppShell: true,
        shellPlatform: "ios",
        isNativeProviderAvailable: () => true,
      }),
    ).toEqual({
      action: "web_oauth_start",
      webOAuthFallbackReason: "ios_kakao_web_oauth_by_design",
    });
  });

  it("blocks kakao on Android native app when SDK unavailable", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "kakao",
        isNativeAppShell: true,
        shellPlatform: "android",
        isNativeProviderAvailable: () => false,
      }),
    ).toEqual({
      action: "native_blocked",
      errorCode: "kakao_native_unavailable",
    });
  });

  it("routes apple to native on iOS shell platform even when isNativeAppShell is false", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "apple",
        isNativeAppShell: false,
        shellPlatform: "ios",
        isNativeProviderAvailable: () => true,
      }),
    ).toEqual({ action: "native_provider_login" });
  });

  it("blocks apple on iOS shell platform when SDK unavailable — no web oauth", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "apple",
        isNativeAppShell: false,
        shellPlatform: "ios",
        isNativeProviderAvailable: () => false,
      }),
    ).toEqual({
      action: "native_blocked",
      errorCode: "apple_native_unavailable",
      webOAuthFallbackReason: "apple_native_plugin_unavailable_on_ios",
    });
  });

  it("falls back to web OAuth for apple on Android native shell", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "apple",
        isNativeAppShell: true,
        shellPlatform: "android",
        isNativeProviderAvailable: () => false,
      }),
    ).toEqual({
      action: "web_oauth_start",
      webOAuthFallbackReason: "android_apple_web_oauth_by_design",
    });
  });

  it("keeps naver web start on native app", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "naver",
        isNativeAppShell: true,
      }),
    ).toEqual({ action: "naver_web_start" });
  });
});
