"use client";

import { useEffect } from "react";
import { preloadOAuthBrowser } from "@/lib/auth/oauth/start-oauth-login";
import { ensureCapacitorNativeMarkerOnBoot } from "@/lib/platform/capacitor-native";

/**
 * Capacitor Android/iOS: server.url marker·getPlatform 기반 dibay_app eager persist.
 * OAuth redirectTo native 분기 전에 marker가 sessionStorage/cookie에 있도록 한다.
 */
export function CapacitorNativeMarkerBootstrap() {
  useEffect(() => {
    ensureCapacitorNativeMarkerOnBoot();
    preloadOAuthBrowser();
  }, []);

  return null;
}
