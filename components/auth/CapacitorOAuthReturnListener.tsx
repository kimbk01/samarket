"use client";

import { useEffect } from "react";
import { handleCapacitorOAuthReturnUrl } from "@/lib/auth/capacitor-oauth-return";
import { notifyOAuthAppUrlOpenReceived } from "@/lib/auth/oauth-pending-lifecycle";
import { logAppUrlOpenMounted } from "@/lib/auth/oauth-flow-log";
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
 * Capacitor Android/iOS: OAuth 완료 후 `dibay://auth/callback` deep link 수신 →
 * WebView HTTPS `/auth/callback` 브릿지 (서버 세션 교환 재사용).
 *
 * 원격 server.url WebView 에서 Capacitor bridge 주입이 늦을 수 있어 짧게 재시도한다.
 * 웹 브라우저(Capacitor 없음)에서는 import 실패/미등록으로 조용히 종료한다.
 */
export function CapacitorOAuthReturnListener() {
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
        void handleCapacitorOAuthReturnUrl(launch.url);
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        notifyOAuthAppUrlOpenReceived(event.url);
        void handleCapacitorOAuthReturnUrl(event.url);
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
