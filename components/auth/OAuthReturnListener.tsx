"use client";

import { useEffect } from "react";
import {
  logOAuthNativeEvent,
  parseOAuthNativeCallbackLogPayload,
} from "@/lib/auth/oauth/oauth-native-callback-log";
import { NATIVE_OAUTH_RETURN_LISTENER_BRIDGE_MS } from "@/lib/auth/oauth/native-oauth-contract";
import { dispatchOAuthPendingClear } from "@/lib/auth/oauth/use-oauth-login";
import {
  shouldRegisterCapacitorOAuthReturnListener,
  shouldRetryCapacitorOAuthReturnListenerAttach,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

const OAUTH_RETURN_LISTENER_RETRY_MS = 150;
const OAUTH_RETURN_LISTENER_MAX_ATTEMPTS = 40;
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

async function handleAppUrlOpen(url: string, markHandled: (key: string) => boolean): Promise<void> {
  const payload = parseOAuthNativeCallbackLogPayload(url);
  if (!url.startsWith(NATIVE_CALLBACK_ORIGIN)) {
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
      return true;
    };

    void (async () => {
      if (!shouldRetryCapacitorOAuthReturnListenerAttach()) {
        return;
      }

      await waitForCapacitorBridgeReady({ timeoutMs: NATIVE_OAUTH_RETURN_LISTENER_BRIDGE_MS });

      for (let attempt = 0; attempt < OAUTH_RETURN_LISTENER_MAX_ATTEMPTS && !cancelled; attempt += 1) {
        if (await attachListener()) {
          return;
        }
        if (!shouldRetryCapacitorOAuthReturnListenerAttach()) {
          return;
        }
        await sleep(OAUTH_RETURN_LISTENER_RETRY_MS);
      }

      if (!cancelled && shouldRegisterCapacitorOAuthReturnListener()) {
        logOAuthNativeEvent("callback_listener_attach_exhausted", {
          attempts: OAUTH_RETURN_LISTENER_MAX_ATTEMPTS,
        });
      }
    })();

    return () => {
      cancelled = true;
      removeAppUrlOpen?.();
    };
  }, []);

  return null;
}
