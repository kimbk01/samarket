import type { OAuthProvider } from "@/lib/auth/auth-providers";
import type { OAuthNativeRoutingDecision } from "@/lib/auth/oauth/oauth-native-routing";
import { resolveOAuthProviderRoutingSnapshot } from "@/lib/auth/oauth/oauth-provider-routing.client";

/**
 * Native Kakao (Android SDK Account path) owns the next screen.
 * dibaY must keep the login surface visually stable during handoff (D1).
 * Mutex may still be held; only visible pre-auth paint is suppressed.
 */
export function shouldSuppressOAuthPreAuthPresentationForRouting(
  provider: OAuthProvider,
  routingAction: OAuthNativeRoutingDecision["action"],
): boolean {
  return provider === "kakao" && routingAction === "native_provider_login";
}

export function shouldSuppressOAuthPreAuthPresentation(provider: OAuthProvider): boolean {
  if (provider !== "kakao") return false;
  const { routing } = resolveOAuthProviderRoutingSnapshot(provider);
  return shouldSuppressOAuthPreAuthPresentationForRouting(provider, routing.action);
}

/** Provider shown as spinner / "로그인 중…" — null when presentation is suppressed. */
export function resolveVisibleOAuthPendingProvider(
  pendingProvider: OAuthProvider | null,
  suppressVisiblePresentation: boolean,
): OAuthProvider | null {
  if (!pendingProvider || suppressVisiblePresentation) return null;
  return pendingProvider;
}
