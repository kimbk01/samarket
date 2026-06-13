"use client";

import { useEffect } from "react";
import { handleCapacitorOAuthReturnUrl } from "@/lib/auth/capacitor-oauth-return";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * Capacitor Android/iOS: OAuth 완료 후 `dibay://auth/callback` deep link 수신 →
 * WebView HTTPS `/auth/callback` 브릿지 (서버 세션 교환 재사용).
 */
export function CapacitorOAuthReturnListener() {
  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    let removeAppUrlOpen: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { App } = await import("@capacitor/app");
      if (cancelled) return;

      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        handleCapacitorOAuthReturnUrl(launch.url);
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        handleCapacitorOAuthReturnUrl(event.url);
      });
      removeAppUrlOpen = () => {
        void listener.remove();
      };
    })();

    return () => {
      cancelled = true;
      removeAppUrlOpen?.();
    };
  }, []);

  return null;
}
