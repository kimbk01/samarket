import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/oauth/config";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { withFreshLoginNextSearchParam } from "@/lib/auth/safe-next-path";

export type BuildOAuthRedirectToInput = {
  isNative: boolean;
  origin: string;
  provider: OAuthProvider;
  next?: string | null;
};

/**
 * OAuth signInWithOAuth `redirectTo` 단일 진입점 (서버·클라 공용).
 * - native: `dibay://auth/callback?provider=...`
 * - web: `{origin}/auth/callback?provider=...`
 */
export function buildOAuthRedirectTo(input: BuildOAuthRedirectToInput): string {
  const { isNative, origin, provider, next } = input;
  const base = isNative
    ? NATIVE_OAUTH_CALLBACK_URL
    : `${origin.replace(/\/$/, "")}/auth/callback`;
  const withProvider = new URL(base);
  withProvider.searchParams.set("provider", provider);
  return withFreshLoginNextSearchParam(withProvider.toString(), next);
}

/** @deprecated buildOAuthRedirectTo — 기존 import 호환 */
export function createOAuthRedirectTo(input: BuildOAuthRedirectToInput): string {
  return buildOAuthRedirectTo(input);
}
