"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS, NATIVE_OAUTH_LAUNCH_PATH, NATIVE_OAUTH_START_FETCH_TIMEOUT_MS, tryBeginOAuthFlow } from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import { isNativeOAuthSupabaseRedirectUrl } from "@/lib/auth/oauth/native-oauth-redirect";
import {
  DIBAY_APP_MARKER_PARAM,
  ensureCapacitorNativeMarkerOnBoot,
  isCapacitorBridgeReady,
  isOAuthNativeLaunchShell,
  readDibayAppPlatformMarker,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

const SUPABASE_OAUTH_PROVIDERS = new Set<OAuthProvider>(["google", "kakao", "apple"]);

export { NATIVE_OAUTH_LAUNCH_PATH, NATIVE_OAUTH_START_FETCH_TIMEOUT_MS };

/** UI 노출 — Facebook(start 미연결) 제외 */
export function isOAuthLoginStartSupported(provider: OAuthProvider): boolean {
  if (provider === "facebook") return false;
  return (
    provider === "google"
    || provider === "kakao"
    || provider === "apple"
    || provider === "naver"
  );
}

type OAuthStartResponse =
  | { ok: true; authorizeUrl: string; provider: string; redirectTo: string }
  | { ok: false; errorCode?: string; message?: string };

function isSupabaseOAuthProvider(provider: OAuthProvider): boolean {
  return SUPABASE_OAUTH_PROVIDERS.has(provider);
}

function buildNativeStartPath(provider: OAuthProvider, next?: string | null): string {
  const path = new URL("/api/auth/oauth/start", window.location.origin);
  path.searchParams.set("provider", provider);
  path.searchParams.set("launch", "native");
  if (next?.trim()) {
    path.searchParams.set("next", next.trim());
  }
  const marker = readDibayAppPlatformMarker();
  if (marker) {
    path.searchParams.set(DIBAY_APP_MARKER_PARAM, marker);
  }
  return `${path.pathname}${path.search}`;
}

function buildWebStartPath(provider: OAuthProvider, next?: string | null): string {
  const path = new URL("/api/auth/oauth/start", window.location.origin);
  path.searchParams.set("provider", provider);
  if (next?.trim()) {
    path.searchParams.set("next", next.trim());
  }
  return `${path.pathname}${path.search}`;
}

export function buildNativeOAuthLaunchPath(provider: OAuthProvider, next?: string | null): string {
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw startError("oauth_start_timeout", "OAuth 시작 요청 시간이 초과되었습니다.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchNativeOAuthAuthorizeUrl(
  provider: OAuthProvider,
  next?: string | null,
): Promise<string> {
  if (!isSupabaseOAuthProvider(provider)) {
    throw startError("invalid_provider", "지원하지 않는 OAuth provider입니다.");
  }

  ensureCapacitorNativeMarkerOnBoot();

  if (!isCapacitorBridgeReady()) {
    const ready = await waitForCapacitorBridgeReady({ timeoutMs: NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS });
    if (!ready) {
      throw startError("oauth_bridge_not_ready", "Capacitor native bridge is not ready.");
    }
    ensureCapacitorNativeMarkerOnBoot();
  }

  const startPath = buildNativeStartPath(provider, next);
  const res = await fetchWithTimeout(startPath, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  }, NATIVE_OAUTH_START_FETCH_TIMEOUT_MS);
  const json = (await res.json().catch(() => null)) as OAuthStartResponse | null;
  if (!res.ok || !json?.ok || !json.authorizeUrl?.trim()) {
    throw startError(
      json?.ok === false ? json.errorCode || "oauth_start_failed" : "oauth_start_failed",
      json?.ok === false ? json.message : "OAuth 시작 URL을 만들지 못했습니다.",
    );
  }

  const redirectTo = json.redirectTo?.trim() ?? "";
  if (!isNativeOAuthSupabaseRedirectUrl(redirectTo)) {
    logOAuthNativeEvent("native_start_redirect_mismatch", { redirectTo, startPath });
    throw startError(
      "oauth_native_redirect_mismatch",
      "Native OAuth redirectTo must use /auth/oauth/capacitor-return on samarket.vercel.app.",
    );
  }

  logOAuthNativeEvent("native_start_ok", {
    provider: json.provider,
    redirectTo,
    authorizeUrlLen: json.authorizeUrl.trim().length,
    dibayAppMarker: readDibayAppPlatformMarker(),
  });
  return json.authorizeUrl.trim();
}

/**
 * Native: launch page → Custom Tab → https capacitor-return → dibay://auth/callback
 * Web: start API 302
 */
export function startOAuthLogin(input: { provider: OAuthProvider; next?: string | null }): void {
  const { provider, next } = input;
  if (!isSupabaseOAuthProvider(provider)) {
    throw startError("invalid_provider", "지원하지 않는 OAuth provider입니다.");
  }
  const flow = tryBeginOAuthFlow(provider);
  if (!flow.ok) {
    throw startError("oauth_flow_in_flight", "OAuth가 이미 진행 중입니다.");
  }
  try {
    if (typeof window === "undefined") {
      throw startError("navigation_failed", "브라우저 환경에서만 OAuth를 시작할 수 있습니다.");
    }

    ensureCapacitorNativeMarkerOnBoot();

    if (isOAuthNativeLaunchShell()) {
      const launchPath = buildNativeOAuthLaunchPath(provider, next);
      logOAuthNativeEvent("start_oauth_login_native", { provider, launchPath });
      window.location.assign(launchPath);
      return;
    }

    logOAuthNativeEvent("start_oauth_login_web", { provider });
    window.location.assign(buildWebStartPath(provider, next));
  } catch (error) {
    flow.release();
    throw error;
  }
}
