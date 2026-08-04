"use client";

import { useEffect } from "react";
import { logOAuthNativeEvent, parseOAuthNativeCallbackLogPayload } from "@/lib/auth/oauth/oauth-native-callback-log";
import { NATIVE_OAUTH_RETURN_LISTENER_BRIDGE_MS } from "@/lib/auth/oauth/native-oauth-contract";
import { deliverNativeOAuthReturnUrl } from "@/lib/auth/oauth/native-oauth-return-bridge";
import {
  shouldRegisterCapacitorOAuthReturnListener,
  shouldRetryCapacitorOAuthReturnListenerAttach,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

const OAUTH_RETURN_LISTENER_RETRY_MS = 150;
const OAUTH_RETURN_LISTENER_MAX_ATTEMPTS = 40;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** @deprecated use buildWebOAuthCallbackUrlFromNativeReturn from native-oauth-return-bridge */
export { buildWebOAuthCallbackUrlFromNativeReturn } from "@/lib/auth/oauth/native-oauth-return-bridge";

/**
 * Capacitor Android/iOS: OAuth 완료 후 `dibay://auth/callback` → WebView `/auth/callback` 브릿지.
 * iOS ASWebAuthenticationSession completion is bridged via openNativeOAuthTab (same deliver helper).
 */
export function OAuthReturnListener() {
  useEffect(() => {
    let removeAppUrlOpen: (() => void) | undefined;
    let cancelled = false;

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
        deliverNativeOAuthReturnUrl(launch.url, "app_url_open");
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        deliverNativeOAuthReturnUrl(event.url, "app_url_open");
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
