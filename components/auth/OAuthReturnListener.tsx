"use client";

import { useEffect } from "react";
import { dispatchOAuthPendingClear } from "@/lib/auth/oauth/use-oauth-login";
import { shouldRegisterCapacitorOAuthReturnListener } from "@/lib/platform/capacitor-native";

const OAUTH_RETURN_LISTENER_RETRY_MS = 150;
const OAUTH_RETURN_LISTENER_MAX_ATTEMPTS = 24;
const NATIVE_CALLBACK_ORIGIN = "dibay://auth";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function buildWebOAuthCallbackUrlFromNativeReturn(nativeUrl: string): string | null {
  try {
    const url = new URL(nativeUrl);
    if (url.protocol !== "dibay:" || url.host !== "auth" || !url.pathname.startsWith("/callback")) {
      return null;
    }
    return `/auth/callback${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

async function closeOAuthBrowser(): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch (err) {
    // Closing the Custom Tab is best effort; the callback navigation is authoritative.
    if (process.env.NODE_ENV !== "production") {
      console.info("[oauth] browser_close_ignored", err instanceof Error ? err.message : String(err));
    }
  }
}

async function handleAppUrlOpen(url: string, markHandled: (key: string) => boolean): Promise<void> {
  if (!url.startsWith(NATIVE_CALLBACK_ORIGIN)) return;
  const webCallbackUrl = buildWebOAuthCallbackUrlFromNativeReturn(url);
  if (!webCallbackUrl) return;
  if (!markHandled(webCallbackUrl)) return;
  dispatchOAuthPendingClear("app_url_open");
  await closeOAuthBrowser();
  window.location.replace(webCallbackUrl);
}

/**
 * Capacitor Android/iOS: OAuth 완료 후 `dibay://auth/callback` → WebView `/auth/callback` 브릿지.
 */
export function OAuthReturnListener() {
  useEffect(() => {
    let removeAppUrlOpen: (() => void) | undefined;
    let cancelled = false;
    const handledCallbackUrls = new Set<string>();

    const markHandled = (key: string): boolean => {
      if (handledCallbackUrls.has(key)) return false;
      handledCallbackUrls.add(key);
      return true;
    };

    const attachListener = async (): Promise<boolean> => {
      if (!shouldRegisterCapacitorOAuthReturnListener()) {
        return false;
      }

      let App: typeof import("@capacitor/app").App;
      try {
        ({ App } = await import("@capacitor/app"));
      } catch {
        return false;
      }
      if (cancelled) return false;

      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        void handleAppUrlOpen(launch.url, markHandled);
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        void handleAppUrlOpen(event.url, markHandled);
      });
      removeAppUrlOpen = () => {
        void listener.remove();
      };
      return true;
    };

    void (async () => {
      for (let attempt = 0; attempt < OAUTH_RETURN_LISTENER_MAX_ATTEMPTS && !cancelled; attempt += 1) {
        if (await attachListener()) {
          return;
        }
        await sleep(OAUTH_RETURN_LISTENER_RETRY_MS);
      }

      return;
    })();

    return () => {
      cancelled = true;
      removeAppUrlOpen?.();
    };
  }, []);

  return null;
}
