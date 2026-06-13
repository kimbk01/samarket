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
  });

  it("blocks google and facebook on native app without Custom Tab fallback", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "google",
        isNativeAppShell: true,
      }),
    ).toEqual({
      action: "native_blocked",
      errorCode: "native_provider_not_implemented",
    });

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

  it("blocks kakao on native app when SDK unavailable", () => {
    expect(
      resolveOAuthNativeRoutingDecision({
        provider: "kakao",
        isNativeAppShell: true,
        isNativeProviderAvailable: () => false,
      }),
    ).toEqual({
      action: "native_blocked",
      errorCode: "kakao_native_unavailable",
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
