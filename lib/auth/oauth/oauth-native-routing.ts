import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  shouldBlockLegacyOAuthOnNativeApp,
  type NativeExchangeProvider,
} from "@/lib/auth/native/native-provider-contract";
import {
  isNativeAppleLoginAvailable,
  isNativeKakaoLoginAvailable,
} from "@/lib/platform/capacitor-native";

export type OAuthNativeRoutingDecision =
  | { action: "naver_web_start" }
  | { action: "native_provider_login" }
  | { action: "native_blocked"; errorCode: string }
  | { action: "web_oauth_start" };

export function isNativeProviderLoginAvailableForRouting(
  provider: NativeExchangeProvider,
): boolean {
  if (provider === "kakao") return isNativeKakaoLoginAvailable();
  if (provider === "apple") return isNativeAppleLoginAvailable();
  return false;
}

export function resolveNativeBlockedProviderErrorCode(provider: OAuthProvider): string {
  if (provider === "google" || provider === "facebook") return "native_provider_not_implemented";
  if (provider === "kakao") return "kakao_native_unavailable";
  if (provider === "apple") return "apple_native_unavailable";
  return "oauth_start_failed";
}

export function resolveOAuthNativeRoutingDecision(input: {
  provider: OAuthProvider;
  isNativeAppShell: boolean;
  isNativeProviderAvailable?: (provider: NativeExchangeProvider) => boolean;
}): OAuthNativeRoutingDecision {
  const { provider, isNativeAppShell } = input;
  const checkAvailable = input.isNativeProviderAvailable ?? isNativeProviderLoginAvailableForRouting;

  if (provider === "naver") {
    return { action: "naver_web_start" };
  }

  if (shouldBlockLegacyOAuthOnNativeApp(provider, isNativeAppShell)) {
    if (
      (provider === "kakao" || provider === "apple")
      && checkAvailable(provider)
    ) {
      return { action: "native_provider_login" };
    }
    return {
      action: "native_blocked",
      errorCode: resolveNativeBlockedProviderErrorCode(provider),
    };
  }

  return { action: "web_oauth_start" };
}
