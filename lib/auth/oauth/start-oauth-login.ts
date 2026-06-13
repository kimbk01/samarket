"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { NATIVE_OAUTH_LAUNCH_PATH } from "@/lib/auth/oauth/native-oauth-launch.constants";
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

function buildWebStartPath(provider: OAuthProvider, next?: string | null): string {
  const path = new URL("/api/auth/oauth/start", window.location.origin);
  path.searchParams.set("provider", provider);
  if (next?.trim()) {
    path.searchParams.set("next", next.trim());
  }
  return `${path.pathname}${path.search}`;
}

function buildNativeLaunchPath(provider: OAuthProvider, next?: string | null): string {
  const path = new URL(NATIVE_OAUTH_LAUNCH_PATH, window.location.origin);
  path.searchParams.set("provider", provider);
  if (next?.trim()) {
    path.searchParams.set("next", next.trim());
  }
  const marker = readDibayAppPlatformMarker();
  if (marker) {
    path.searchParams.set(DIBAY_APP_MARKER_PARAM, marker);
  }
  return `${path.pathname}${path.search}`;
}

function startError(code: string, message?: string): Error {
  const err = new Error(message || code);
  err.name = code;
  return err;
}

/** Capacitor Browser 플러그인을 앱 부팅 시 미리 로드한다 (native-launch 페이지·복귀 리스너용). */
export function preloadOAuthBrowser(): void {
  if (typeof window === "undefined") return;
  void import("@capacitor/browser");
}

export function startOAuthLogin(input: StartOAuthLoginInput): void {
  const { provider, next } = input;
  if (!isSupabaseOAuthProvider(provider)) {
    throw startError("invalid_provider", "지원하지 않는 OAuth provider입니다.");
  }
  if (typeof window === "undefined") {
    throw startError("navigation_failed", "브라우저 환경에서만 OAuth를 시작할 수 있습니다.");
  }

  ensureCapacitorNativeMarkerOnBoot();
  const native = isCapacitorNativePlatform();

  if (native) {
    window.location.assign(buildNativeLaunchPath(provider, next));
    return;
  }

  window.location.assign(buildWebStartPath(provider, next));
}
