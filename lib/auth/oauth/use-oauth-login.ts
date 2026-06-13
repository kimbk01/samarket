"use client";

import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { buildNaverOAuthStartPath } from "@/lib/auth/get-oauth-redirect-url";
import { mapOAuthStartError } from "@/lib/auth/oauth/errors";
import {
  clearOAuthPending,
  confirmOAuthPendingLaunched,
  getOAuthPendingProvider,
  setOAuthPending,
  subscribeOAuthPending,
} from "@/lib/auth/oauth/pending";
import { startOAuthLogin } from "@/lib/auth/oauth/start";
import { isNaverProvider } from "@/lib/auth/oauth/config";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ensureCapacitorNativeMarkerOnBoot } from "@/lib/platform/capacitor-native";

type UseOAuthLoginOptions = {
  next?: string | null;
  onModalClose?: () => void;
};

function getPendingServerSnapshot(): OAuthProvider | null {
  return null;
}

export function useOAuthLogin(options: UseOAuthLoginOptions = {}) {
  const { next = null } = options;
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  const pendingOAuthProvider = useSyncExternalStore(
    subscribeOAuthPending,
    getOAuthPendingProvider,
    getPendingServerSnapshot,
  );

  const startOAuthProvider = useCallback(
    async (provider: OAuthProvider) => {
      if (pendingOAuthProvider) return;

      flushSync(() => {
        ensureCapacitorNativeMarkerOnBoot();
        setError(null);
      });

      if (isNaverProvider(provider)) {
        flushSync(() => {
          setOAuthPending(provider);
        });
        try {
          window.location.assign(buildNaverOAuthStartPath(next));
          confirmOAuthPendingLaunched();
        } catch {
          clearOAuthPending("launch_failed");
          setError(mapOAuthStartError("navigation_failed", t));
        }
        return;
      }

      const result = await startOAuthLogin({ provider, next });
      if (!result.ok) {
        setError(mapOAuthStartError(result.errorCode, t));
      }
    },
    [next, pendingOAuthProvider, t],
  );

  const clearOAuthError = useCallback(() => {
    setError(null);
  }, []);

  const resetOAuthOnClose = useCallback(() => {
    clearOAuthPending("manual");
    setError(null);
  }, []);

  return {
    pendingOAuthProvider,
    oauthError: error,
    startOAuthProvider,
    clearOAuthError,
    resetOAuthOnClose,
  };
}
