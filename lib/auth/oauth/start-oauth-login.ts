"use client";

import type { BrowserPlugin } from "@capacitor/browser";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  DIBAY_APP_MARKER_PARAM,
  ensureCapacitorNativeMarkerOnBoot,
  isCapacitorNativePlatform,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";

const SUPABASE_OAUTH_PROVIDERS = new Set<OAuthProvider>(["google", "kakao", "apple"]);
export const OAUTH_START_FETCH_TIMEOUT_MS = 10_000;
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

let browserPlugin: BrowserPlugin | null = null;
let browserPluginReady: Promise<boolean> | null = null;
const authorizeUrlCache = new Map<string, CachedAuthorizeUrl>();
const authorizeUrlInflight = new Map<string, Promise<string | null>>();

function isSupabaseOAuthProvider(provider: OAuthProvider): boolean {
  return SUPABASE_OAUTH_PROVIDERS.has(provider);
}

function buildPrefetchKey(provider: OAuthProvider, next?: string | null): string {
  return `${provider}:${next?.trim() ?? ""}`;
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

async function ensureOAuthBrowserReady(): Promise<boolean> {
  if (browserPlugin) return true;
  if (!browserPluginReady) {
    browserPluginReady = import("@capacitor/browser")
      .then(({ Browser }) => {
        browserPlugin = Browser;
        return true;
      })
      .catch(() => false);
  }
  return browserPluginReady;
}

/** Capacitor Browser 플러그인을 앱 부팅 시 미리 로드한다. */
export function preloadOAuthBrowser(): void {
  if (typeof window === "undefined") return;
  void ensureOAuthBrowserReady();
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

/**
 * 탭 제스처 체인 안에서 Browser.open 을 호출한다.
 * fetch await 이후에는 Android Custom Tab 이 열리지 않을 수 있어 prefetch + sync open 을 사용한다.
 */
export function openNativeOAuthBrowserSync(url: string): boolean {
  if (!url.trim()) return false;
  if (!browserPlugin) return false;
  void browserPlugin.open({ url: url.trim() });
  return true;
}

export function readPrefetchedNativeOAuthAuthorizeUrl(
  provider: OAuthProvider,
  next?: string | null,
): string | null {
  return readCachedAuthorizeUrl(provider, next);
}

export function resetNativeOAuthStateForTests(): void {
  browserPlugin = null;
  browserPluginReady = null;
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
  const startPath = buildStartPath(provider, true, next);
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

async function openNativeOAuth(url: string): Promise<void> {
  const ready = await ensureOAuthBrowserReady();
  if (!ready || !browserPlugin) {
    throw startError("browser_plugin_unavailable", "OAuth Browser 플러그인을 사용할 수 없습니다.");
  }
  try {
    await browserPlugin.open({ url });
  } catch {
    throw startError("browser_open_rejected", "OAuth 브라우저를 열지 못했습니다.");
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

  if (native) {
    const cached = readCachedAuthorizeUrl(provider, next);
    if (cached && openNativeOAuthBrowserSync(cached)) {
      return;
    }

    await ensureOAuthBrowserReady();
    const prefetched = authorizeUrlInflight.get(buildPrefetchKey(provider, next));
    const authorizeUrl = cached
      ?? (prefetched ? await prefetched : null)
      ?? await fetchNativeAuthorizeUrl(provider, next);

    if (!authorizeUrl) {
      throw startError("oauth_start_failed", "OAuth 시작 URL을 만들지 못했습니다.");
    }
    storeCachedAuthorizeUrl(provider, next, authorizeUrl);

    if (openNativeOAuthBrowserSync(authorizeUrl)) {
      return;
    }

    await openNativeOAuth(authorizeUrl);
    return;
  }

  window.location.assign(startPath);
}
