"use client";

import { useEffect } from "react";
import { handleOAuthReturnUrl } from "@/lib/auth/oauth/return-bridge";
import { logAppUrlOpenMounted } from "@/lib/auth/oauth/log";
import { notifyOAuthAppUrlOpenReceived } from "@/lib/auth/oauth/pending";
import { ensureOAuthPendingListeners } from "@/lib/auth/oauth/pending";
import {
  getCapacitorNativeDiagnostics,
  shouldRegisterCapacitorOAuthReturnListener,
} from "@/lib/platform/capacitor-native";

const OAUTH_RETURN_LISTENER_RETRY_MS = 150;
const OAUTH_RETURN_LISTENER_MAX_ATTEMPTS = 24;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Capacitor Android/iOS: OAuth 완료 후 `dibay://auth/callback` → WebView `/auth/callback` 브릿지.
 */
export function OAuthReturnListener() {
  useEffect(() => {
    ensureOAuthPendingListeners();

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
        return false;
      }
      if (cancelled) return false;

      logAppUrlOpenMounted({
        ...getCapacitorNativeDiagnostics(),
        attempt: "registered",
      });

      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        notifyOAuthAppUrlOpenReceived(launch.url);
        void handleOAuthReturnUrl(launch.url);
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        notifyOAuthAppUrlOpenReceived(event.url);
        void handleOAuthReturnUrl(event.url);
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

      if (!cancelled) {
        logAppUrlOpenMounted({
          ...getCapacitorNativeDiagnostics(),
          attempt: "skipped_web_or_no_capacitor",
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
