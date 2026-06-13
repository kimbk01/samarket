"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, useState } from "react";
import { flushSync } from "react-dom";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { buildNaverOAuthStartPath } from "@/lib/auth/get-oauth-redirect-url";
import {
  openPrefetchedNativeOAuthFromUserGesture,
  prefetchNativeOAuthAuthorizeUrl,
  preloadOAuthBrowser,
  readPrefetchedNativeOAuthAuthorizeUrl,
  startOAuthLogin,
} from "@/lib/auth/oauth/start-oauth-login";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ensureCapacitorNativeMarkerOnBoot, isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

const SUPABASE_OAUTH_PROVIDERS: OAuthProvider[] = ["google", "kakao", "apple"];

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

function isNaverProvider(provider: OAuthProvider): boolean {
  return provider === "naver";
}

function mapOAuthErrorToMessage(code: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (code === "invalid_provider") return t("auth_err_invalid_provider");
  if (code === "supabase_unconfigured") return t("auth_err_supabase_unconfigured");
  if (code === "browser_plugin_unavailable") return t("auth_err_oauth_browser_plugin_unavailable");
  if (code === "browser_open_rejected" || code === "browser_open_timeout") {
    return t("auth_err_oauth_browser_open_failed");
  }
  if (code === "oauth_start_timeout") return t("auth_err_auth_timeout");
  if (code === "navigation_failed") return t("auth_err_oauth_launch_navigation_failed");
  return t("auth_err_oauth_start_failed");
}

export function dispatchOAuthPendingClear(reason: string): void {
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
    if (!isCapacitorNativePlatform()) return;
    preloadOAuthBrowser();
    for (const provider of SUPABASE_OAUTH_PROVIDERS) {
      prefetchNativeOAuthAuthorizeUrl(provider, next);
    }
  }, [next]);

  useEffect(() => {
    pendingProviderRef.current = pendingOAuthProvider;
  }, [pendingOAuthProvider]);

  const clearPending = useCallback(() => {
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
    const handleVisible = () => {
      if (document.visibilityState === "visible") clearPending();
    };
    window.addEventListener(OAUTH_PENDING_CLEAR_EVENT, handleClear);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(OAUTH_PENDING_CLEAR_EVENT, handleClear);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [clearPending, pendingOAuthProvider]);

  const handleOAuthFailure = useCallback((err: unknown) => {
    clearPending();
    const code = err instanceof Error ? err.name || err.message : "oauth_start_failed";
    if (mountedRef.current) setError(mapOAuthErrorToMessage(code, t));
  }, [clearPending, t]);

  const startOAuthProvider = useCallback(
    (provider: OAuthProvider) => {
      if (pendingProviderRef.current) return;

      flushSync(() => {
        ensureCapacitorNativeMarkerOnBoot();
        if (mountedRef.current) setError(null);
        pendingProviderRef.current = provider;
        setSharedPending(provider);
      });

      if (isNaverProvider(provider)) {
        try {
          window.location.assign(buildNaverOAuthStartPath(next));
        } catch {
          clearPending();
          if (mountedRef.current) setError(mapOAuthErrorToMessage("navigation_failed", t));
        }
        return;
      }

      if (isCapacitorNativePlatform()) {
        const prefetchedUrl = readPrefetchedNativeOAuthAuthorizeUrl(provider, next);
        if (prefetchedUrl) {
          void openPrefetchedNativeOAuthFromUserGesture(provider, next).catch(handleOAuthFailure);
          return;
        }
      }

      void startOAuthLogin({ provider, next }).catch(handleOAuthFailure);
    },
    [clearPending, handleOAuthFailure, next, t],
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
