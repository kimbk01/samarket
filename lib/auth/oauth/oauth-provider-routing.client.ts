"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  resolveAppleWebOAuthFallbackReason,
  resolveOAuthNativeRoutingDecision,
  type OAuthNativeRoutingDecision,
} from "@/lib/auth/oauth/oauth-native-routing";
import {
  isCapacitorNativePlatform,
  isOAuthNativeLaunchShell,
  resolveOAuthRoutingShellPlatform,
  type DibayAppPlatform,
} from "@/lib/platform/capacitor-native";

export function isNativeAppOAuthShell(): boolean {
  return isCapacitorNativePlatform() || isOAuthNativeLaunchShell();
}

/** Apple·native shell — bridge/marker 준비 후 routing (iOS WebKit bridge 포함). */
export function shouldWaitCapacitorBridgeBeforeOAuthRouting(provider: OAuthProvider): boolean {
  if (isNativeAppOAuthShell()) return true;
  if (provider === "apple") {
    return resolveOAuthRoutingShellPlatform() === "ios";
  }
  return false;
}

export type OAuthProviderRoutingSnapshot = {
  provider: OAuthProvider;
  isNativeShell: boolean;
  shellPlatform: DibayAppPlatform | null;
  routing: OAuthNativeRoutingDecision;
  appleWebOAuthFallbackReason: ReturnType<typeof resolveAppleWebOAuthFallbackReason>;
};

export function resolveOAuthProviderRoutingSnapshot(
  provider: OAuthProvider,
  options?: { shellPlatform?: DibayAppPlatform | null },
): OAuthProviderRoutingSnapshot {
  const isNativeShell = isNativeAppOAuthShell();
  const shellPlatform = options?.shellPlatform ?? resolveOAuthRoutingShellPlatform();
  const routing = resolveOAuthNativeRoutingDecision({
    provider,
    isNativeAppShell: isNativeShell,
    shellPlatform,
  });
  const appleWebOAuthFallbackReason =
    provider === "apple"
      ? resolveAppleWebOAuthFallbackReason({
          provider,
          shellPlatform,
          isNativeAppShell: isNativeShell,
          routingAction: routing.action,
        })
      : null;

  return {
    provider,
    isNativeShell,
    shellPlatform,
    routing,
    appleWebOAuthFallbackReason,
  };
}

/** iOS Apple — web_oauth_start가 routing을 통과한 경우 safety net. */
export function shouldBlockAppleWebOAuthSafetyNet(
  shellPlatform: DibayAppPlatform | null,
  routingAction: OAuthNativeRoutingDecision["action"],
): boolean {
  return shellPlatform === "ios" && routingAction === "web_oauth_start";
}
