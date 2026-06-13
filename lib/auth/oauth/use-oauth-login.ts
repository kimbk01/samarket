"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, useState } from "react";
import { flushSync } from "react-dom";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { buildNaverOAuthStartPath } from "@/lib/auth/get-oauth-redirect-url";
import { isOAuthLoginStartSupported, startOAuthLogin } from "@/lib/auth/oauth/start-oauth-login";
import { endOAuthFlow, isOAuthInFlightPath, releaseOAuthFlowOnUserCancel, tryBeginOAuthFlow } from "@/lib/auth/oauth/native-oauth-contract";
import { NativeAppleAuthError } from "@/lib/auth/native/native-apple-auth-plugin";
import { NativeKakaoAuthError } from "@/lib/auth/native/native-kakao-auth-plugin";
import {
  NativeProviderLoginError,
  startNativeProviderLogin,
} from "@/lib/auth/native/start-native-provider-login.client";
import {
  resolveNativeBlockedProviderErrorCode,
  resolveOAuthNativeRoutingDecision,
} from "@/lib/auth/oauth/oauth-native-routing";
import {
  ensureCapacitorNativeMarkerOnBoot,
  isCapacitorNativePlatform,
  isOAuthNativeLaunchShell,
} from "@/lib/platform/capacitor-native";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export const OAUTH_PENDING_CLEAR_EVENT = "dibay:oauth-pending-clear";
export const OAUTH_PENDING_TIMEOUT_MS = 30_000;

let sharedPendingProvider: OAuthProvider | null = null;
const pendingSubscribers = new Set<() => void>();

type UseOAuthLoginOptions = {
  next?: string | null;
  onModalClose?: () => void;
};

export function resolveOAuthPendingAfterClear(
  current: OAuthProvider | null,
  _reason: string,
): OAuthProvider | null {
  if (!current) return null;
  return null;
}

function emitPendingChange(): void {
  for (const subscriber of pendingSubscribers) {
    subscriber();
  }
}

function subscribePending(listener: () => void): () => void {
  pendingSubscribers.add(listener);
  return () => {
    pendingSubscribers.delete(listener);
  };
}

function getPendingSnapshot(): OAuthProvider | null {
  return sharedPendingProvider;
}

function getPendingServerSnapshot(): OAuthProvider | null {
  return null;
}

function setSharedPending(provider: OAuthProvider | null): void {
  if (sharedPendingProvider === provider) return;
  sharedPendingProvider = provider;
  emitPendingChange();
}

export function getOAuthPendingSnapshotForTests(): OAuthProvider | null {
  return getPendingSnapshot();
}

export function setOAuthPendingForTests(provider: OAuthProvider | null): void {
  setSharedPending(provider);
}

function isNativeAppOAuthShell(): boolean {
  return isCapacitorNativePlatform() || isOAuthNativeLaunchShell();
}

function isNaverProvider(provider: OAuthProvider): boolean {
  return provider === "naver";
}

function isNativeProviderCancelError(err: unknown): boolean {
  if (err instanceof NativeKakaoAuthError && err.code === "user_cancelled") return true;
  if (err instanceof NativeAppleAuthError && err.code === "user_cancelled") return true;
  return false;
}

function resolveNativeProviderLoginErrorCode(err: unknown): string {
  if (err instanceof NativeProviderLoginError) return err.code;
  if (err instanceof NativeKakaoAuthError) return err.code;
  if (err instanceof NativeAppleAuthError) return err.code;
  if (err instanceof Error) return err.name || err.message || "oauth_start_failed";
  return "oauth_start_failed";
}

function mapOAuthErrorToMessage(code: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (code === "oauth_flow_in_flight") return t("auth_err_oauth_start_failed");
  if (code === "invalid_provider") return t("auth_err_invalid_provider");
  if (code === "supabase_unconfigured") return t("auth_err_supabase_unconfigured");
  if (code === "oauth_launcher_unavailable") {
    return t("auth_err_oauth_browser_plugin_unavailable");
  }
  if (code === "oauth_tab_open_failed" || code === "oauth_custom_tabs_unavailable") {
    return t("auth_err_oauth_browser_open_failed");
  }
  if (code === "oauth_bridge_not_ready") return t("auth_err_oauth_bridge_not_ready");
  if (code === "oauth_start_timeout") return t("auth_err_auth_timeout");
  if (code === "navigation_failed") return t("auth_err_oauth_launch_navigation_failed");
  if (code === "user_cancelled") return t("auth_err_oauth_start_failed");
  if (code === "apple_native_exchange_not_ready") return t("auth_err_apple_native_not_ready");
  if (code === "apple_native_verify_failed") return t("auth_err_apple_native_verify_failed");
  if (code === "apple_native_account_conflict") return t("auth_err_apple_native_account_conflict");
  if (code === "apple_native_invalid_audience") return t("auth_err_apple_native_invalid_audience");
  if (code === "apple_native_config_error" || code === "apple_native_token_missing") {
    return t("auth_err_oauth_start_failed");
  }
  if (code === "apple_native_unavailable") return t("auth_err_apple_native_unavailable");
  if (code === "kakao_native_exchange_not_ready") return t("auth_err_kakao_native_not_ready");
  if (code === "kakao_native_verify_failed") return t("auth_err_kakao_native_verify_failed");
  if (code === "kakao_native_account_conflict") return t("auth_err_kakao_native_account_conflict");
  if (code === "kakao_native_config_error" || code === "kakao_native_token_missing") {
    return t("auth_err_kakao_native_config_error");
  }
  if (code === "kakao_native_key_hash_required") return t("auth_err_kakao_native_key_hash_required");
  if (code === "kakao_native_unavailable") return t("auth_err_kakao_native_unavailable");
  if (code === "native_provider_not_implemented") return t("auth_err_native_provider_not_implemented");
  return t("auth_err_oauth_start_failed");
}

export function dispatchOAuthPendingClear(reason: string): void {
  endOAuthFlow();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OAUTH_PENDING_CLEAR_EVENT, { detail: { reason } }));
}

/** login 복귀·OAuth 취소 — in-flight lock 즉시 해제 */
export function releaseOAuthFlowAfterUserCancel(reason = "user_cancel"): void {
  releaseOAuthFlowOnUserCancel();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OAUTH_PENDING_CLEAR_EVENT, { detail: { reason } }));
}

export function useOAuthLogin(options: UseOAuthLoginOptions = {}) {
  const { next = null } = options;
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const pendingOAuthProvider = useSyncExternalStore(
    subscribePending,
    getPendingSnapshot,
    getPendingServerSnapshot,
  );
  const mountedRef = useRef(false);
  const pendingProviderRef = useRef<OAuthProvider | null>(pendingOAuthProvider);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    pendingProviderRef.current = pendingOAuthProvider;
  }, [pendingOAuthProvider]);

  const clearPending = useCallback(() => {
    endOAuthFlow();
    pendingProviderRef.current = null;
    setSharedPending(null);
  }, []);

  useEffect(() => {
    if (!pendingOAuthProvider) return;

    const timeoutId = window.setTimeout(clearPending, OAUTH_PENDING_TIMEOUT_MS);
    const handleClear = (event: Event) => {
      const reason =
        event instanceof CustomEvent ? String(event.detail?.reason ?? "manual") : "manual";
      const nextProvider = resolveOAuthPendingAfterClear(pendingProviderRef.current, reason);
      pendingProviderRef.current = nextProvider;
      setSharedPending(nextProvider);
    };
    window.addEventListener(OAUTH_PENDING_CLEAR_EVENT, handleClear);

    const maybeReleaseOnForegroundReturn = () => {
      if (document.visibilityState !== "visible") return;
      const path = window.location.pathname;
      if (isOAuthInFlightPath(path)) return;
      if (path === "/login" || path === "/signup" || path.startsWith("/login/")) {
        clearPending();
      }
    };
    document.addEventListener("visibilitychange", maybeReleaseOnForegroundReturn);
    window.addEventListener("pageshow", maybeReleaseOnForegroundReturn);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(OAUTH_PENDING_CLEAR_EVENT, handleClear);
      document.removeEventListener("visibilitychange", maybeReleaseOnForegroundReturn);
      window.removeEventListener("pageshow", maybeReleaseOnForegroundReturn);
    };
  }, [clearPending, pendingOAuthProvider]);

  const startOAuthProvider = useCallback(
    (provider: OAuthProvider) => {
      if (pendingProviderRef.current) return;
      if (!isOAuthLoginStartSupported(provider)) return;

      flushSync(() => {
        ensureCapacitorNativeMarkerOnBoot();
        if (mountedRef.current) setError(null);
        pendingProviderRef.current = provider;
        setSharedPending(provider);
      });

      if (isNaverProvider(provider)) {
        const flow = tryBeginOAuthFlow(provider);
        if (!flow.ok) {
          clearPending();
          return;
        }
        try {
          window.location.assign(buildNaverOAuthStartPath(next));
        } catch {
          flow.release();
          clearPending();
          if (mountedRef.current) setError(mapOAuthErrorToMessage("navigation_failed", t));
        }
        return;
      }

      const routing = resolveOAuthNativeRoutingDecision({
        provider,
        isNativeAppShell: isNativeAppOAuthShell(),
      });

      if (routing.action === "native_provider_login") {
        void startNativeProviderLogin({ provider, next })
          .catch((err) => {
            if (isNativeProviderCancelError(err)) {
              releaseOAuthFlowOnUserCancel();
              clearPending();
              return;
            }
            clearPending();
            const code = resolveNativeProviderLoginErrorCode(err);
            console.error("[oauth] native_provider_login_failed", { provider, code, err });
            if (mountedRef.current) setError(mapOAuthErrorToMessage(code, t));
          });
        return;
      }

      if (routing.action === "native_blocked") {
        clearPending();
        if (mountedRef.current) setError(mapOAuthErrorToMessage(routing.errorCode, t));
        return;
      }

      try {
        startOAuthLogin({ provider, next });
      } catch (err) {
        clearPending();
        const code = err instanceof Error ? err.name || err.message : "oauth_start_failed";
        if (mountedRef.current) setError(mapOAuthErrorToMessage(code, t));
      }
    },
    [clearPending, next, t],
  );

  const clearOAuthError = useCallback(() => {
    if (mountedRef.current) setError(null);
  }, []);

  const resetOAuthOnClose = useCallback(() => {
    clearPending();
    if (mountedRef.current) setError(null);
  }, [clearPending]);

  return {
    pendingOAuthProvider,
    oauthError: error,
    startOAuthProvider,
    clearOAuthError,
    resetOAuthOnClose,
  };
}
