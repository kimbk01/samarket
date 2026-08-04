import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  shouldBlockLegacyOAuthOnNativeApp,
  type NativeExchangeProvider,
} from "@/lib/auth/native/native-provider-contract";
import {
  isNativeAppleLoginAvailable,
  isNativeGoogleLoginAvailable,
  isNativeKakaoLoginAvailable,
  resolveCapacitorShellPlatform,
  type DibayAppPlatform,
} from "@/lib/platform/capacitor-native";

export type OAuthNativeRoutingDecision =
  | { action: "naver_web_start" }
  | { action: "native_provider_login" }
  | { action: "native_blocked"; errorCode: string; webOAuthFallbackReason?: string }
  | { action: "web_oauth_start"; webOAuthFallbackReason?: string };

export type AppleWebOAuthFallbackReason =
  | "browser_or_non_ios_shell"
  | "android_apple_web_oauth_by_design"
  | "apple_native_plugin_unavailable_on_ios"
  | "shell_not_detected_before_routing";

export function resolveAppleWebOAuthFallbackReason(input: {
  provider: OAuthProvider;
  shellPlatform: DibayAppPlatform | null;
  isNativeAppShell: boolean;
  routingAction: OAuthNativeRoutingDecision["action"];
}): AppleWebOAuthFallbackReason | null {
  if (input.provider !== "apple") return null;
  if (input.routingAction === "native_provider_login") return null;
  if (input.routingAction === "native_blocked") {
    if (input.shellPlatform === "ios") return "apple_native_plugin_unavailable_on_ios";
    return null;
  }
  if (input.routingAction === "web_oauth_start") {
    if (input.shellPlatform === "ios") return "shell_not_detected_before_routing";
    if (input.shellPlatform === "android") return "android_apple_web_oauth_by_design";
    return "browser_or_non_ios_shell";
  }
  return null;
}

export function isNativeProviderLoginAvailableForRouting(
  provider: NativeExchangeProvider,
): boolean {
  if (provider === "kakao") return isNativeKakaoLoginAvailable();
  if (provider === "apple") return isNativeAppleLoginAvailable();
  if (provider === "google") return isNativeGoogleLoginAvailable();
  return false;
}

export function resolveNativeBlockedProviderErrorCode(provider: OAuthProvider): string {
  if (provider === "facebook") return "native_provider_not_implemented";
  if (provider === "google") return "google_native_unavailable";
  if (provider === "kakao") return "kakao_native_unavailable";
  if (provider === "apple") return "apple_native_unavailable";
  return "oauth_start_failed";
}

export function resolveOAuthNativeRoutingDecision(input: {
  provider: OAuthProvider;
  isNativeAppShell: boolean;
  isNativeProviderAvailable?: (provider: NativeExchangeProvider) => boolean;
  /** unit test · routing override — 기본값은 resolveCapacitorShellPlatform() */
  shellPlatform?: DibayAppPlatform | null;
}): OAuthNativeRoutingDecision {
  const { provider, isNativeAppShell } = input;
  const checkAvailable = input.isNativeProviderAvailable ?? isNativeProviderLoginAvailableForRouting;
  const shellPlatform = input.shellPlatform ?? resolveCapacitorShellPlatform();

  if (provider === "naver") {
    return { action: "naver_web_start" };
  }

  /**
   * iOS Capacitor — Apple 은 AuthenticationServices 전용.
   * shellPlatform=ios 이면 isNativeAppShell false 여도 Web OAuth(Chrome/Safari) 금지.
   */
  if (provider === "apple" && shellPlatform === "ios") {
    if (checkAvailable("apple")) {
      return { action: "native_provider_login" };
    }
    return {
      action: "native_blocked",
      errorCode: "apple_native_unavailable",
      webOAuthFallbackReason: "apple_native_plugin_unavailable_on_ios",
    };
  }

  /**
   * iOS Capacitor — Kakao Native Talk 복귀는 handled=1 이후 token callback 미도착이 실측됨.
   * Google iOS 와 동일하게 Supabase Web OAuth + Custom Tab 사용 (레거시 Capacitor 경로).
   * Android Kakao 는 Native SDK 유지.
   */
  if (provider === "kakao" && shellPlatform === "ios") {
    return {
      action: "web_oauth_start",
      webOAuthFallbackReason: "ios_kakao_web_oauth_by_design",
    };
  }

  /**
   * Android Capacitor — Apple Native SDK 없음. Supabase Web OAuth / Custom Tab 허용.
   */
  if (provider === "apple" && shellPlatform === "android") {
    return {
      action: "web_oauth_start",
      webOAuthFallbackReason: "android_apple_web_oauth_by_design",
    };
  }

  if (shouldBlockLegacyOAuthOnNativeApp(provider, isNativeAppShell)) {
    if (
      (provider === "kakao" || provider === "apple" || provider === "google")
      && checkAvailable(provider)
    ) {
      return { action: "native_provider_login" };
    }
    /** iOS — Google Native SDK 미구현. Custom Tab Web OAuth 허용 (Android 는 Native SDK 전용). */
    if (provider === "google" && shellPlatform === "ios") {
      return { action: "web_oauth_start" };
    }
    return {
      action: "native_blocked",
      errorCode: resolveNativeBlockedProviderErrorCode(provider),
    };
  }

  return {
    action: "web_oauth_start",
    webOAuthFallbackReason:
      provider === "apple" ? "browser_or_non_ios_shell" : undefined,
  };
}
