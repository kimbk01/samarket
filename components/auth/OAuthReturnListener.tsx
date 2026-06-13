"use client";

import { useEffect } from "react";
import {
  logOAuthNativeEvent,
  parseOAuthNativeCallbackLogPayload,
} from "@/lib/auth/oauth/oauth-native-callback-log";
import { dispatchOAuthPendingClear } from "@/lib/auth/oauth/use-oauth-login";
import {
  shouldRegisterCapacitorOAuthReturnListener,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

const OAUTH_RETURN_LISTENER_RETRY_MS = 150;
const OAUTH_RETURN_LISTENER_MAX_ATTEMPTS = 60;
const OAUTH_RETURN_BRIDGE_WAIT_MS = 5_000;
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
  const payload = parseOAuthNativeCallbackLogPayload(url);
  if (!url.startsWith(NATIVE_CALLBACK_ORIGIN)) {
    logOAuthNativeEvent("callback_ignored", { reason: "non_dibay_scheme", urlPrefix: url.slice(0, 32) });
    return;
  }

  logOAuthNativeEvent("callback_app_url_open", {
    payload,
    nativeUrlLen: url.length,
  });

  const webCallbackUrl = buildWebOAuthCallbackUrlFromNativeReturn(url);
  if (!webCallbackUrl) {
    logOAuthNativeEvent("callback_ignored", { reason: "invalid_callback_path", payload });
    return;
  }
  if (!markHandled(webCallbackUrl)) {
    logOAuthNativeEvent("callback_ignored", { reason: "duplicate", webCallbackUrl });
    return;
  }

  logOAuthNativeEvent("callback_bridge", {
    webCallbackUrl,
    payload,
  });

  dispatchOAuthPendingClear("app_url_open");
  await closeOAuthBrowser();

  logOAuthNativeEvent("callback_navigate", { webCallbackUrl });
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
        logOAuthNativeEvent("callback_listener_attach_failed", { reason: "app_plugin_import" });
        return false;
      }
      if (cancelled) return false;

      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        logOAuthNativeEvent("callback_launch_url", {
          urlLen: launch.url.length,
          payload: parseOAuthNativeCallbackLogPayload(launch.url),
        });
        void handleAppUrlOpen(launch.url, markHandled);
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        void handleAppUrlOpen(event.url, markHandled);
      });
      logOAuthNativeEvent("callback_listener_attached");
      removeAppUrlOpen = () => {
        void listener.remove();
      };

      let removeBrowserFinished: (() => void) | undefined;
      try {
        const { Browser } = await import("@capacitor/browser");
        const browserFinishedListener = await Browser.addListener("browserFinished", () => {
          dispatchOAuthPendingClear("browser_finished");
        });
        removeBrowserFinished = () => {
          void browserFinishedListener.remove();
        };
      } catch {
        // Browser plugin unavailable — appUrlOpen bridge remains authoritative.
      }

      const previousRemove = removeAppUrlOpen;
      removeAppUrlOpen = () => {
        previousRemove?.();
        removeBrowserFinished?.();
      };
      return true;
    };

    void (async () => {
      await waitForCapacitorBridgeReady({ timeoutMs: OAUTH_RETURN_BRIDGE_WAIT_MS });

      for (let attempt = 0; attempt < OAUTH_RETURN_LISTENER_MAX_ATTEMPTS && !cancelled; attempt += 1) {
        if (await attachListener()) {
          return;
        }
        await sleep(OAUTH_RETURN_LISTENER_RETRY_MS);
      }

      logOAuthNativeEvent("callback_listener_attach_exhausted", {
        attempts: OAUTH_RETURN_LISTENER_MAX_ATTEMPTS,
      });
    })();

    return () => {
      cancelled = true;
      removeAppUrlOpen?.();
    };
  }, []);

  return null;
}
