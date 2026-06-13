"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  DIBAY_APP_MARKER_PARAM,
  ensureCapacitorNativeMarkerOnBoot,
  isCapacitorNativePlatform,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";

const SUPABASE_OAUTH_PROVIDERS = new Set<OAuthProvider>(["google", "kakao", "apple"]);

type StartOAuthLoginInput = {
  provider: OAuthProvider;
  next?: string | null;
};

function isSupabaseOAuthProvider(provider: OAuthProvider): boolean {
  return SUPABASE_OAUTH_PROVIDERS.has(provider);
}

function buildStartPath(provider: OAuthProvider, next?: string | null): string {
  const path = new URL("/api/auth/oauth/start", window.location.origin);
  path.searchParams.set("provider", provider);
  if (next?.trim()) {
    path.searchParams.set("next", next.trim());
  }
  if (isCapacitorNativePlatform()) {
    const marker = readDibayAppPlatformMarker();
    if (marker) {
      path.searchParams.set(DIBAY_APP_MARKER_PARAM, marker);
    }
  }
  return `${path.pathname}${path.search}`;
}

function startError(code: string, message?: string): Error {
  const err = new Error(message || code);
  err.name = code;
  return err;
}

/** OAuthReturnListener Browser.close 경로용 — start 는 WebView navigation 만 사용한다. */
export function preloadOAuthBrowser(): void {
  if (typeof window === "undefined") return;
  void import("@capacitor/browser").catch(() => {
    // Best effort preload for callback close only.
  });
}

/**
 * Google/Kakao/Apple OAuth 시작 — web·native 공통.
 * Native: WebView 가 start API(302) → provider → dibay://auth/callback deep link.
 * Custom Tab 은 사용하지 않는다 — Android user-gesture·PKCE 분리 문제 회피.
 */
export function startOAuthLogin(input: StartOAuthLoginInput): void {
  const { provider, next } = input;
  if (!isSupabaseOAuthProvider(provider)) {
    throw startError("invalid_provider", "지원하지 않는 OAuth provider입니다.");
  }
  if (typeof window === "undefined") {
    throw startError("navigation_failed", "브라우저 환경에서만 OAuth를 시작할 수 있습니다.");
  }

  ensureCapacitorNativeMarkerOnBoot();
  window.location.assign(buildStartPath(provider, next));
}
