"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LoginProviderButtons } from "@/components/auth/LoginProviderButtons";
import { OAuthInlineLoginHint } from "@/components/auth/OAuthInlineLoginHint";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import { usePasswordLogin } from "@/components/auth/usePasswordLogin";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { finishClientAuthLogin } from "@/lib/auth/finish-client-auth-login.client";
import { useOAuthLogin, type OAuthAuthSuccessInput } from "@/lib/auth/oauth/use-oauth-login";
import type { LoginRequiredDetail } from "@/lib/auth/require-auth-action";
import { AuthGateOverlay } from "@/components/auth/AuthGateOverlay";
import { AuthProviderEmailConflictHost } from "@/components/auth/AuthProviderEmailConflictHost";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";

type Props = {
  open: boolean;
  detail: LoginRequiredDetail | null;
  onClose: () => void;
};

export function AuthModal({ open, detail, onClose }: Props) {
  /** Auth flow chrome via AuthGateOverlay → DibayOverlayRoot (OAuth untouched). */
  const { t } = useI18n();
  const router = useRouter();
  const [providers, setProviders] = useState<AuthProviderPublic[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [providersLoadFailed, setProvidersLoadFailed] = useState(false);

  const next = useMemo(() => {
    if (detail?.next?.trim()) return detail.next.trim();
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}`;
  }, [detail?.next]);

  const handleAuthSuccess = useCallback(
    async (input: OAuthAuthSuccessInput) => {
      await finishClientAuthLogin({
        redirectTo: input.redirectTo,
        pendingToken: detail?.token,
        next,
        needsTermsAgreement: input.needsTermsAgreement,
        consentComplete: input.consentComplete,
        signupComplete: input.signupComplete,
        // Slice 6-7: preserve Native Thin Handoff client-sync flag (do not drop).
        syncFromNativeExchangeCookies: input.syncFromNativeExchangeCookies === true,
        onCloseModal: onClose,
        router,
      });
    },
    [detail?.token, next, onClose, router],
  );

  const {
    pendingOAuthProvider,
    visiblePendingOAuthProvider,
    oauthInlineStatus,
    oauthError,
    startOAuthProvider,
    resetOAuthOnClose,
  } = useOAuthLogin({
    next,
    pendingToken: detail?.token,
    onModalClose: onClose,
    onAuthSuccess: handleAuthSuccess,
  });

  /** P1-9: /login 과 동일한 아이디 로그인 핸들러 (약관 게이트 포함) */
  const passwordLogin = usePasswordLogin({
    next,
    router,
    pendingToken: detail?.token,
    onCloseModal: onClose,
  });
  const { error, loading, reset: resetPasswordLogin } = passwordLogin;

  useEffect(() => {
    if (open) return;
    setShowEmailLogin(false);
    resetPasswordLogin();
    resetOAuthOnClose();
  }, [open, resetOAuthOnClose, resetPasswordLogin]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setProvidersLoading(true);
      try {
        const [providersRes, settingsRes] = await Promise.all([
          runSingleFlight("auth-modal:providers", () =>
            fetch("/api/auth-providers?enabled=true", { credentials: "include", cache: "no-store" }),
          ),
          runSingleFlight("auth-modal:settings", () =>
            fetch("/api/auth/login-settings", { credentials: "include", cache: "no-store" }),
          ),
        ]);
        const providersJson = (await providersRes.json().catch(() => null)) as
          | { ok?: boolean; providers?: AuthProviderPublic[] }
          | null;
        const settingsJson = (await settingsRes.json().catch(() => null)) as
          | { ok?: boolean; settings?: Array<{ provider?: string; enabled?: boolean }> }
          | null;
        if (cancelled) return;
        const providersOk = providersRes.ok && providersJson?.ok && Array.isArray(providersJson.providers);
        setProvidersLoadFailed(!providersOk);
        setProviders(providersOk && providersJson?.providers ? providersJson.providers : []);
        const passwordSetting = settingsJson?.settings?.find((item) => item.provider === "password");
        setPasswordEnabled(passwordSetting ? passwordSetting.enabled === true : true);
      } catch {
        if (!cancelled) {
          setProviders([]);
          setProvidersLoadFailed(true);
        }
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleOAuthLogin = useCallback(
    (provider: OAuthProvider) => {
      void startOAuthProvider(provider);
    },
    [startOAuthProvider],
  );

  const handleOpenInternalLogin = useCallback(() => {
    setShowEmailLogin(true);
  }, []);

  const displayError = error || oauthError || null;

  return (
    <>
      <AuthGateOverlay open={open} onClose={onClose} labelledBy="dibay-auth-modal-title">
        <div className="relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full text-sam-muted hover:bg-sam-surface-muted hover:text-sam-fg"
            aria-label={t("common_close")}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="mx-auto flex justify-center" aria-hidden>
            <DibayAuthLogo size={56} />
          </div>
          <h2 id="dibay-auth-modal-title" className="mt-3 text-center text-lg font-semibold text-sam-fg">
            {t("auth_login_title")}
          </h2>
          <p className="mt-1 text-center sam-text-body-secondary text-sam-muted">
            {t("auth_login_auto_signup_hint")}
          </p>

          <div className="mt-5 space-y-4">
            <LoginProviderButtons
              surface="overlay"
              providers={providers}
              disabled={loading}
              pendingOAuthProvider={pendingOAuthProvider}
              signingInOAuthProvider={visiblePendingOAuthProvider}
              emptyText={
                providersLoadFailed
                  ? undefined
                  : providersLoading
                    ? t("auth_sns_providers_loading")
                    : t("auth_sns_providers_none")
              }
              showEmailEntry={passwordEnabled && !showEmailLogin}
              onEmailLoginClick={handleOpenInternalLogin}
              onSelectProvider={(provider) => void handleOAuthLogin(provider)}
            />
            {providersLoadFailed && !providersLoading ? (
              <p className="sam-text-body-secondary text-center text-sam-danger">
                {t("auth_sns_providers_load_failed")}
              </p>
            ) : null}
            <OAuthInlineLoginHint status={oauthInlineStatus} />
            {!showEmailLogin && displayError ? (
              <p className="sam-text-body-secondary text-center text-sam-danger" role="alert">{displayError}</p>
            ) : null}
            {passwordEnabled && showEmailLogin ? (
              <div data-auth-surface="internal" data-testid="auth-internal-login-panel">
                <p className="mt-1 sam-text-body-secondary text-center text-sam-muted">
                  {t("auth_login_internal_hint")}
                </p>
                <PasswordLoginForm
                  identifier={passwordLogin.identifier}
                  password={passwordLogin.password}
                  error={displayError}
                  disabled={loading || pendingOAuthProvider != null}
                  loading={loading}
                  loadingText={passwordLogin.statusText}
                  className="mt-2 space-y-4"
                  onIdentifierChange={passwordLogin.setIdentifier}
                  onPasswordChange={passwordLogin.setPassword}
                  onSubmit={passwordLogin.submit}
                />
              </div>
            ) : null}
          </div>
        </div>
      </AuthGateOverlay>
      <AuthProviderEmailConflictHost
        onLoginWithExistingProvider={handleOAuthLogin}
        onOpenInternalLogin={handleOpenInternalLogin}
      />
    </>
  );
}
