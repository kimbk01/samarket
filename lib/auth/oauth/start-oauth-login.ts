"use client";

import { Browser } from "@capacitor/browser";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  DIBAY_APP_MARKER_PARAM,
  ensureCapacitorNativeMarkerOnBoot,
  isCapacitorNativePlatform,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";

const SUPABASE_OAUTH_PROVIDERS = new Set<OAuthProvider>(["google", "kakao", "apple"]);
export const OAUTH_START_FETCH_TIMEOUT_MS = 10_000;
export const OAUTH_BROWSER_OPEN_TIMEOUT_MS = 8_000;
const NATIVE_AUTHORIZE_URL_CACHE_TTL_MS = 5 * 60 * 1000;

type StartOAuthLoginInput = {
  provider: OAuthProvider;
  next?: string | null;
};

type OAuthStartResponse =
  | { ok: true; authorizeUrl: string; provider: string; redirectTo: string }
  | { ok: false; errorCode?: string; message?: string };

type CachedAuthorizeUrl = {
  url: string;
  fetchedAt: number;
};

const authorizeUrlCache = new Map<string, CachedAuthorizeUrl>();
const authorizeUrlInflight = new Map<string, Promise<string | null>>();

function isSupabaseOAuthProvider(provider: OAuthProvider): boolean {
  return SUPABASE_OAUTH_PROVIDERS.has(provider);
}

function buildPrefetchKey(provider: OAuthProvider, next?: string | null): string {
  return `${provider}:${next?.trim() ?? ""}`;
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

function startError(code: string, message?: string): Error {
  const err = new Error(message || code);
  err.name = code;
  return err;
}

function readCachedAuthorizeUrl(provider: OAuthProvider, next?: string | null): string | null {
  const cached = authorizeUrlCache.get(buildPrefetchKey(provider, next));
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > NATIVE_AUTHORIZE_URL_CACHE_TTL_MS) {
    authorizeUrlCache.delete(buildPrefetchKey(provider, next));
    return null;
  }
  return cached.url;
}

function storeCachedAuthorizeUrl(provider: OAuthProvider, next: string | null | undefined, url: string): void {
  authorizeUrlCache.set(buildPrefetchKey(provider, next), { url, fetchedAt: Date.now() });
}

/** Capacitor Browser 플러그인 warm-up — 탭 직후 open 지연을 줄인다. */
export function preloadOAuthBrowser(): void {
  if (typeof window === "undefined") return;
  void Browser.close().catch(() => {
    // Plugin warm-up only.
  });
}

export function prefetchNativeOAuthAuthorizeUrl(provider: OAuthProvider, next?: string | null): void {
  if (typeof window === "undefined") return;
  if (!isCapacitorNativePlatform() || !isSupabaseOAuthProvider(provider)) return;

  const key = buildPrefetchKey(provider, next);
  if (authorizeUrlInflight.has(key) || readCachedAuthorizeUrl(provider, next)) return;

  const inflight = fetchNativeAuthorizeUrl(provider, next)
    .then((url) => {
      if (url) storeCachedAuthorizeUrl(provider, next, url);
      return url;
    })
    .finally(() => {
      authorizeUrlInflight.delete(key);
    });
  authorizeUrlInflight.set(key, inflight);
}

export function readPrefetchedNativeOAuthAuthorizeUrl(
  provider: OAuthProvider,
  next?: string | null,
): string | null {
  return readCachedAuthorizeUrl(provider, next);
}

export function isNativeOAuthAuthorizeUrlReady(provider: OAuthProvider, next?: string | null): boolean {
  return readCachedAuthorizeUrl(provider, next) != null;
}

export function resetNativeOAuthStateForTests(): void {
  authorizeUrlCache.clear();
  authorizeUrlInflight.clear();
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

async function fetchNativeAuthorizeUrl(provider: OAuthProvider, next?: string | null): Promise<string | null> {
  const startPath = buildNativeStartPath(provider, next);
  const res = await fetchWithTimeout(startPath, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  }, OAUTH_START_FETCH_TIMEOUT_MS);
  const json = (await res.json().catch(() => null)) as OAuthStartResponse | null;
  if (!res.ok || !json?.ok || !json.authorizeUrl?.trim()) {
    return null;
  }
  return json.authorizeUrl.trim();
}

async function openNativeOAuthAuthorizeUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw startError("oauth_start_failed", "OAuth 시작 URL이 비어 있습니다.");
  }

  let timeoutId: number | undefined;
  try {
    await Promise.race([
      Browser.open({ url: trimmed }),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(startError("browser_open_timeout", "OAuth 브라우저 열기 시간이 초과되었습니다.")),
          OAUTH_BROWSER_OPEN_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err) {
    if (err instanceof Error && err.name && !["Error", "DOMException"].includes(err.name)) {
      throw err;
    }
    throw startError("browser_open_rejected", "OAuth 브라우저를 열지 못했습니다.");
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId);
  }
}

/**
 * Native: WebView fetch(PKCE) → Custom Tab(authorizeUrl) → dibay://auth/callback
 * Web: start API 302 → provider → HTTPS /auth/callback
 */
export async function startOAuthLogin(input: StartOAuthLoginInput): Promise<void> {
  const { provider, next } = input;
  if (!isSupabaseOAuthProvider(provider)) {
    throw startError("invalid_provider", "지원하지 않는 OAuth provider입니다.");
  }
  if (typeof window === "undefined") {
    throw startError("navigation_failed", "브라우저 환경에서만 OAuth를 시작할 수 있습니다.");
  }

  ensureCapacitorNativeMarkerOnBoot();

  if (isCapacitorNativePlatform()) {
    const cached = readCachedAuthorizeUrl(provider, next);
    const inflight = authorizeUrlInflight.get(buildPrefetchKey(provider, next));
    const authorizeUrl = cached
      ?? (inflight ? await inflight : null)
      ?? await fetchNativeAuthorizeUrl(provider, next);

    if (!authorizeUrl) {
      throw startError("oauth_start_failed", "OAuth 시작 URL을 만들지 못했습니다.");
    }
    storeCachedAuthorizeUrl(provider, next, authorizeUrl);
    await openNativeOAuthAuthorizeUrl(authorizeUrl);
    return;
  }

  window.location.assign(buildWebStartPath(provider, next));
}

/**
 * 탭 제스처 체인 안에서 Custom Tab 을 연다. prefetch 가 끝난 경우에만 사용한다.
 */
export function openPrefetchedNativeOAuthFromUserGesture(
  provider: OAuthProvider,
  next?: string | null,
): Promise<void> {
  const authorizeUrl = readCachedAuthorizeUrl(provider, next);
  if (!authorizeUrl) {
    return Promise.reject(startError("oauth_start_failed", "OAuth 준비가 끝나지 않았습니다."));
  }
  return openNativeOAuthAuthorizeUrl(authorizeUrl);
}
