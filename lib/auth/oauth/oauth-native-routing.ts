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
   */
  if (provider === "kakao" && shellPlatform === "ios") {
    return {
      action: "web_oauth_start",
      webOAuthFallbackReason: "ios_kakao_web_oauth_by_design",
    };
  }

  /**
   * Android Capacitor — Kakao 도 Supabase Web OAuth + Custom Tab (2026-10-22 실기기 근거).
   * Native SDK 경로는 (1) Custom Tab 동안 앱 프로세스가 죽으면 SDK 콜백(메모리)이 사라져 동의 후 멈추고
   * (샤오미 onProcessDied 실측), (2) SDK 키 해시 검사에서 거부될 수 있다 (삼성 실측).
   * Web OAuth 는 PKCE verifier 를 WebView 쿠키에 두고 capacitor-return → /auth/callback 으로 이어가므로
   * 프로세스 재시작 후에도 로그인이 완료되고, 키 해시를 쓰지 않는다. APK 재빌드 불필요.
   */
  if (provider === "kakao" && shellPlatform === "android") {
    return {
      action: "web_oauth_start",
      webOAuthFallbackReason: "android_kakao_web_oauth_process_death_safe",
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
