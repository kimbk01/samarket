"use client";

import { useEffect, useRef } from "react";
import { buildValidatedNativeAppCallbackUrl } from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";

/**
 * Custom Tab OAuth bridge — Supabase redirects here (https), then JS opens dibay:// for the app.
 */
export default function OAuthCapacitorReturnPage() {
  const bridgedRef = useRef(false);

  useEffect(() => {
    if (bridgedRef.current) return;
    bridgedRef.current = true;

    const search = window.location.search;
    const hash = window.location.hash;
    const target = buildValidatedNativeAppCallbackUrl(search, hash);

    if (!target) {
      logOAuthNativeEvent("capacitor_return_bridge_skipped", {
        hasSearch: Boolean(search),
        hasHash: Boolean(hash),
        reason: "missing_code_or_error",
      });
      return;
    }

    logOAuthNativeEvent("capacitor_return_bridge", {
      hasSearch: Boolean(search),
      hasHash: Boolean(hash),
      targetPrefix: target.slice(0, 56),
    });
    window.location.replace(target);
  }, []);

  return null;
}
