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

type DibayOAuthPlugin = {
  open: (options: { url: string }) => Promise<void>;
};

type WindowWithCapacitorPlugin = Window & {
  Capacitor?: {
    Plugins?: {
      DibayOAuth?: DibayOAuthPlugin;
    };
    registerPlugin?: (pluginName: string) => DibayOAuthPlugin;
    isPluginAvailable?: (pluginName: string) => boolean;
  };
};

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

/** Capacitor native OAuth bridge를 앱 부팅 시 미리 등록한다. */
export function preloadOAuthBrowser(): void {
  if (typeof window === "undefined") return;
  try {
    const cap = (window as WindowWithCapacitorPlugin).Capacitor;
    cap?.registerPlugin?.("DibayOAuth");
  } catch {
    // Native bridge may not be ready yet; startOAuthLogin retries at click time.
  }
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

function getNativeOAuthPlugin(): DibayOAuthPlugin | null {
  const cap = (window as WindowWithCapacitorPlugin).Capacitor;
  if (!cap) return null;
  if (cap.isPluginAvailable?.("DibayOAuth") === false) return null;
  if (cap.Plugins?.DibayOAuth) return cap.Plugins.DibayOAuth;
  try {
    return cap.registerPlugin?.("DibayOAuth") ?? null;
  } catch {
    return null;
  }
}

async function openNativeOAuth(url: string): Promise<void> {
  const plugin = getNativeOAuthPlugin();
  if (!plugin?.open) {
    throw startError("browser_plugin_unavailable", "앱 로그인 브릿지를 사용할 수 없습니다.");
  }
  try {
    await plugin.open({ url });
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
    await openNativeOAuth(json.authorizeUrl.trim());
    return;
  }

  window.location.assign(startPath);
}
