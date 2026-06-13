"use client";

import { useEffect } from "react";
import { buildNativeOAuthAppCallbackUrl } from "@/lib/auth/oauth/native-oauth-redirect";

/**
 * Custom Tab OAuth bridge — Supabase redirects here (https), then JS opens dibay:// for the app.
 */
export default function OAuthCapacitorReturnPage() {
  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    const target = buildNativeOAuthAppCallbackUrl(search, hash);
    console.error("[oauth] capacitor_return_bridge", {
      hasSearch: Boolean(search),
      hasHash: Boolean(hash),
      targetPrefix: target.slice(0, 56),
    });
    window.location.replace(target);
  }, []);

  return null;
}
