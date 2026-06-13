"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  DIBAY_APP_MARKER_PARAM,
  ensureCapacitorNativeMarkerOnBoot,
  isCapacitorNativePlatform,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";

const SUPABASE_OAUTH_PROVIDERS = new Set<OAuthProvider>(["google", "kakao", "apple"]);
export const OAUTH_START_FETCH_TIMEOUT_MS = 10_000;

type StartOAuthLoginInput = {
  provider: OAuthProvider;
  next?: string | null;
};

type OAuthStartResponse =
  | { ok: true; authorizeUrl: string; provider: string; redirectTo: string }
  | { ok: false; errorCode?: string; message?: string };

function isSupabaseOAuthProvider(provider: OAuthProvider): boolean {
  return SUPABASE_OAUTH_PROVIDERS.has(provider);
}

function buildStartPath(provider: OAuthProvider, native: boolean, next?: string | null): string {
  const path = new URL("/api/auth/oauth/start", window.location.origin);
  path.searchParams.set("provider", provider);
  if (next?.trim()) {
    path.searchParams.set("next", next.trim());
  }
  if (native) {
    path.searchParams.set("launch", "native");
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

export async function startOAuthLogin(input: StartOAuthLoginInput): Promise<void> {
  const { provider, next } = input;
  if (!isSupabaseOAuthProvider(provider)) {
    throw startError("invalid_provider", "지원하지 않는 OAuth provider입니다.");
  }
  if (typeof window === "undefined") {
    throw startError("navigation_failed", "브라우저 환경에서만 OAuth를 시작할 수 있습니다.");
  }

  ensureCapacitorNativeMarkerOnBoot();
  const native = isCapacitorNativePlatform();
  const startPath = buildStartPath(provider, native, next);

  if (!native) {
    window.location.assign(startPath);
    return;
  }

  const res = await fetchWithTimeout(startPath, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  }, OAUTH_START_FETCH_TIMEOUT_MS);
  const json = (await res.json().catch(() => null)) as OAuthStartResponse | null;
  if (!res.ok || !json?.ok || !json.authorizeUrl?.trim()) {
    throw startError(
      json?.ok === false ? json.errorCode || "oauth_start_failed" : "oauth_start_failed",
      json?.ok === false ? json.message : "OAuth 시작 URL을 만들지 못했습니다.",
    );
  }

  let Browser: typeof import("@capacitor/browser").Browser;
  try {
    ({ Browser } = await import("@capacitor/browser"));
  } catch {
    throw startError("browser_plugin_unavailable", "OAuth 브라우저 플러그인을 불러오지 못했습니다.");
  }

  try {
    await Browser.open({ url: json.authorizeUrl.trim() });
  } catch {
    throw startError("browser_open_rejected", "OAuth 브라우저를 열지 못했습니다.");
  }
}
