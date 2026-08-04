/**
 * Native OAuth return bridge — single owner for dibay://auth/callback → /auth/callback.
 *
 * Sources:
 * - Capacitor App appUrlOpen (Android Custom Tabs)
 * - iOS ASWebAuthenticationSession completion (callback URL is NOT also delivered via appUrlOpen)
 *
 * Does not exchange tokens / profile / onboarding — /auth/callback remains session owner.
 */
import {
  logOAuthNativeEvent,
  parseOAuthNativeCallbackLogPayload,
} from "@/lib/auth/oauth/oauth-native-callback-log";
import { endOAuthFlow } from "@/lib/auth/oauth/native-oauth-contract";
import { bumpAuthLifecycleCounter, markAuthLifecycleStage } from "@/lib/auth/oauth/auth-lifecycle-trace";

/** Must match use-oauth-login OAUTH_PENDING_CLEAR_EVENT (avoid circular import). */
const OAUTH_PENDING_CLEAR_EVENT = "dibay:oauth-pending-clear";

const NATIVE_CALLBACK_ORIGIN = "dibay://auth";

/** Process-wide dedupe across listener + launcher completion (one logical settle). */
const handledWebCallbackUrls = new Set<string>();

export type NativeOAuthReturnVia = "app_url_open" | "as_web_auth_completion";

export type NativeOAuthReturnBridgeResult =
  | { ok: true; webCallbackUrl: string; navigated: true }
  | { ok: false; reason: "ignored_origin" | "invalid_callback_path" | "duplicate" };

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

function markHandled(webCallbackUrl: string): boolean {
  if (handledWebCallbackUrls.has(webCallbackUrl)) return false;
  handledWebCallbackUrls.add(webCallbackUrl);
  return true;
}

/** Test-only — clear dedupe between cases. */
export function resetNativeOAuthReturnBridgeForTests(): void {
  handledWebCallbackUrls.clear();
}

/**
 * Deliver dibay://auth/callback… into the existing /auth/callback exchange path.
 * Never logs authorization code / raw query.
 */
export function deliverNativeOAuthReturnUrl(
  nativeUrl: string,
  via: NativeOAuthReturnVia,
): NativeOAuthReturnBridgeResult {
  const trimmed = nativeUrl.trim();
  const payload = parseOAuthNativeCallbackLogPayload(trimmed);

  if (!trimmed.startsWith(NATIVE_CALLBACK_ORIGIN)) {
    logOAuthNativeEvent("callback_ignored", { reason: "ignored_origin", via, nativeUrlLen: trimmed.length });
    return { ok: false, reason: "ignored_origin" };
  }

  bumpAuthLifecycleCounter("callbackRoute");
  markAuthLifecycleStage("provider_credential_received", {
    via,
    hasCode: payload?.hasCode ?? false,
    hasError: payload?.hasError ?? false,
  });
  logOAuthNativeEvent("callback_app_url_open", {
    payload,
    nativeUrlLen: trimmed.length,
    via,
  });

  const webCallbackUrl = buildWebOAuthCallbackUrlFromNativeReturn(trimmed);
  if (!webCallbackUrl) {
    logOAuthNativeEvent("callback_ignored", { reason: "invalid_callback_path", payload, via });
    return { ok: false, reason: "invalid_callback_path" };
  }
  if (!markHandled(webCallbackUrl)) {
    logOAuthNativeEvent("callback_ignored", { reason: "duplicate", webCallbackUrl, via });
    return { ok: false, reason: "duplicate" };
  }

  logOAuthNativeEvent("callback_bridge", {
    webCallbackUrl,
    payload,
    via,
  });

  clearOAuthPendingUi(via === "as_web_auth_completion" ? "as_web_auth_completion" : "app_url_open");

  logOAuthNativeEvent("callback_navigate", { webCallbackUrl, via });
  window.location.replace(webCallbackUrl);
  return { ok: true, webCallbackUrl, navigated: true };
}

function clearOAuthPendingUi(reason: string): void {
  endOAuthFlow();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OAUTH_PENDING_CLEAR_EVENT, { detail: { reason } }));
}
