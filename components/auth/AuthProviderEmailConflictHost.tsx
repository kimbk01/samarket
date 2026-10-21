"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AuthProviderEmailConflictModal } from "@/components/auth/AuthProviderEmailConflictModal";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  clearProviderEmailConflict,
  getProviderEmailConflict,
  subscribeProviderEmailConflict,
} from "@/lib/auth/provider-identity/provider-email-conflict.client";
import type { ConflictExistingLoginAction } from "@/components/auth/provider-email-conflict-redirect";

type Props = {
  /** 화면이 소유한 useOAuthLogin().startOAuthProvider — 별도 시작 경로 금지. */
  onLoginWithExistingProvider: (provider: OAuthProvider) => void;
  /** 기존 방식이 이메일(아이디)일 때 내부 로그인 폼을 연다. */
  onOpenInternalLogin: () => void;
};

export function AuthProviderEmailConflictHost({ onLoginWithExistingProvider, onOpenInternalLogin }: Props) {
  const conflict = useSyncExternalStore(
    subscribeProviderEmailConflict,
    getProviderEmailConflict,
    () => null,
  );

  const handleLoginWithExisting = useCallback(
    (action: ConflictExistingLoginAction) => {
      if (action.kind === "unsupported") return;
      clearProviderEmailConflict();
      if (action.kind === "internal") {
        onOpenInternalLogin();
        return;
      }
      onLoginWithExistingProvider(action.provider);
    },
    [onLoginWithExistingProvider, onOpenInternalLogin],
  );

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
