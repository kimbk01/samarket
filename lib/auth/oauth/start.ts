import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  DIBAY_APP_MARKER_PARAM,
  ensureCapacitorNativeMarkerOnBoot,
  isCapacitorNativePlatform,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";
import { OAUTH_START_API_PATH } from "@/lib/auth/oauth/config";
import {
  logOAuthBrowserOpenFailed,
  logOAuthBrowserOpenStart,
  logOAuthBrowserOpenSuccess,
  logOAuthLaunchNavigation,
} from "@/lib/auth/oauth/log";
import {
  clearOAuthPending,
  confirmOAuthPendingLaunched,
  setOAuthPending,
} from "@/lib/auth/oauth/pending";
import type { SupabaseOAuthProvider } from "@/lib/auth/oauth/config";
import { isSupabaseOAuthProvider } from "@/lib/auth/oauth/config";

export type OAuthClientStartResult =
  | { ok: true }
  | { ok: false; errorCode: string };

export function buildOAuthStartUrl(input: {
  origin: string;
  provider: SupabaseOAuthProvider;
  next?: string | null;
  nativeLaunch?: boolean;
}): string {
  const { origin, provider, next, nativeLaunch = isCapacitorNativePlatform() } = input;
  const url = new URL(OAUTH_START_API_PATH, origin);
  url.searchParams.set("provider", provider);
  if (next?.trim()) {
    url.searchParams.set("next", next.trim());
  }
  if (nativeLaunch) {
    url.searchParams.set("launch", "native");
    const platform = readDibayAppPlatformMarker();
    if (platform) {
      url.searchParams.set(DIBAY_APP_MARKER_PARAM, platform);
    }
  }
  return url.toString();
}

async function launchNativeAuthorizeUrl(authorizeUrl: string): Promise<OAuthClientStartResult> {
  let Browser: typeof import("@capacitor/browser").Browser;
  try {
    ({ Browser } = await import("@capacitor/browser"));
  } catch {
    logOAuthBrowserOpenFailed("browser_plugin_unavailable");
    return { ok: false, errorCode: "browser_plugin_unavailable" };
  }

  logOAuthBrowserOpenStart(authorizeUrl);
  try {
    await Browser.open({ url: authorizeUrl });
    logOAuthBrowserOpenSuccess();
    return { ok: true };
  } catch (err) {
    logOAuthBrowserOpenFailed("browser_open_rejected", err);
    return { ok: false, errorCode: "browser_open_rejected" };
  }
}

export async function startOAuthLogin(input: {
  provider: OAuthProvider;
  next?: string | null;
}): Promise<OAuthClientStartResult> {
  const { provider, next } = input;
  if (!isSupabaseOAuthProvider(provider)) {
    return { ok: false, errorCode: "invalid_provider" };
  }

  if (typeof window === "undefined") {
    return { ok: false, errorCode: "navigation_failed" };
  }

  ensureCapacitorNativeMarkerOnBoot();
  setOAuthPending(provider);

  const origin = window.location.origin;
  const startUrl = buildOAuthStartUrl({ origin, provider, next, nativeLaunch: isCapacitorNativePlatform() });

  if (isCapacitorNativePlatform()) {
    try {
      const res = await fetch(startUrl, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; authorizeUrl?: string; error?: string; errorCode?: string }
        | null;

      if (!res.ok || !json?.ok || !json.authorizeUrl?.trim()) {
        const errorCode = String(json?.errorCode ?? json?.error ?? "oauth_start_failed").trim();
        clearOAuthPending("launch_failed");
        return { ok: false, errorCode };
      }

      const launchResult = await launchNativeAuthorizeUrl(json.authorizeUrl.trim());
      if (!launchResult.ok) {
        clearOAuthPending("launch_failed");
        return launchResult;
      }

      confirmOAuthPendingLaunched();
      return { ok: true };
    } catch {
      clearOAuthPending("launch_failed");
      return { ok: false, errorCode: "oauth_start_failed" };
    }
  }

  try {
    logOAuthLaunchNavigation(startUrl);
    window.location.assign(startUrl);
    return { ok: true };
  } catch {
    clearOAuthPending("launch_failed");
    return { ok: false, errorCode: "navigation_failed" };
  }
}
