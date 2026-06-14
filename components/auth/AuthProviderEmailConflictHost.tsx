"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AuthProviderEmailConflictModal } from "@/components/auth/AuthProviderEmailConflictModal";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { startNativeProviderLogin } from "@/lib/auth/native/start-native-provider-login.client";
import { startOAuthLogin } from "@/lib/auth/oauth/start-oauth-login";
import { resolveOAuthProviderRoutingSnapshot } from "@/lib/auth/oauth/oauth-provider-routing.client";
import {
  clearProviderEmailConflict,
  getProviderEmailConflict,
  subscribeProviderEmailConflict,
} from "@/lib/auth/provider-identity/provider-email-conflict.client";

export function AuthProviderEmailConflictHost() {
  const conflict = useSyncExternalStore(
    subscribeProviderEmailConflict,
    getProviderEmailConflict,
    () => null,
  );

  const handleLoginWithExisting = useCallback((provider: OAuthProvider) => {
    clearProviderEmailConflict();
    const routing = resolveOAuthProviderRoutingSnapshot(provider);
    if (routing.routing.action === "native_provider_login") {
      void startNativeProviderLogin({ provider });
      return;
    }
    void startOAuthLogin({ provider });
  }, []);

  const handleDismiss = useCallback(() => {
    clearProviderEmailConflict();
  }, []);

  return (
    <AuthProviderEmailConflictModal
      open={Boolean(conflict)}
      conflict={conflict}
      onLoginWithExisting={handleLoginWithExisting}
      onDismiss={handleDismiss}
    />
  );
}
